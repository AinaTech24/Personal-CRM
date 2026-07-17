import { lookup } from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";

interface ResolvedConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

/**
 * Resolves the active SMTP config: admin-configured DB settings take precedence,
 * falling back to environment variables so existing deployments keep working.
 */
async function resolveConfig(): Promise<ResolvedConfig | null> {
  const row = await db.smtpSettings.findUnique({ where: { id: "default" } }).catch(() => null);

  const host = row?.host || process.env.SMTP_HOST;
  const user = row?.username || process.env.SMTP_USER;
  const password = row?.password || process.env.SMTP_PASSWORD;
  if (!host || !user || !password) return null;

  const port = row?.port ?? Number(process.env.SMTP_PORT ?? 587);
  const secure = row?.secure ?? port === 465;
  const fromName = row?.fromName || "Aina CRM";
  const fromEmail = row?.fromEmail || user;
  const from = row ? `${fromName} <${fromEmail}>` : process.env.SMTP_FROM ?? `${fromName} <${fromEmail}>`;

  return { host, port, secure, user, password, from };
}

/**
 * Resolves a mail host to an IPv4 address, or null if it has no A record.
 *
 * Passing `family: 4` to createTransport does nothing: nodemailer builds its own
 * socket options and only forwards a fixed set of keys (host, port, localAddress,
 * tls), so the option is silently dropped and never reaches net.connect.
 *
 * Its own resolver isn't a fix either. It keeps an AAAA address whenever
 * shared.isFamilySupported() sees any non-internal IPv6 address on a network
 * interface — but a link-local fe80:: address means an interface, not a route.
 * Hosts with one but no outbound IPv6 (Render, plenty of ISPs) then connect to
 * Gmail's IPv6 and fail with ENETUNREACH before sending a byte.
 *
 * Resolving here sidesteps all of it: nodemailer skips DNS entirely for a host
 * that's already an IP literal (shared.resolveHostname short-circuits on
 * net.isIP), so it connects to exactly the address we hand it.
 */
async function resolveIpv4(host: string): Promise<string | null> {
  if (net.isIP(host)) return host;
  try {
    const { address } = await lookup(host, { family: 4 });
    return address;
  } catch {
    // No A record, or DNS is down. Fall back to the hostname and let nodemailer
    // try — an IPv6-only mail host should still work where IPv6 routing exists.
    return null;
  }
}

async function makeTransport(cfg: ResolvedConfig) {
  const ipv4 = await resolveIpv4(cfg.host);
  return nodemailer.createTransport({
    host: ipv4 ?? cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    // Connecting by IP would make the certificate check fail (the cert names the
    // host, not the address), so TLS is pointed back at the real hostname.
    // Identity is verified against `servername`, so this keeps full validation
    // rather than weakening it.
    tls: { servername: cfg.host },
    // Without explicit timeouts, a hung/filtered connection falls back to the
    // OS's default TCP timeout (can be a minute or more) before nodemailer
    // gives up — bound every phase so a bad config fails back to the UI fast.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
}

interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailInput) {
  const cfg = await resolveConfig();

  if (!cfg) {
    console.log(
      `[mailer] SMTP not configured — stubbing email.\n  to: ${to}\n  subject: ${subject}\n  html: ${html}`
    );
    return;
  }

  const transport = await makeTransport(cfg);
  await transport.sendMail({ from: cfg.from, to, subject, html });
}

/** Verifies the current SMTP configuration by opening a connection. Returns an error message if it fails. */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const cfg = await resolveConfig();
  if (!cfg) return { ok: false, error: "SMTP is not configured" };
  try {
    const transport = await makeTransport(cfg);
    await transport.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

export function resetCodeEmailHtml(opts: { name: string; code: string }) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>Your Aina CRM sign-in code</h2>
      <p>Hi ${opts.name}, use the code below to sign in:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:20px 0;color:#111;">${opts.code}</p>
      <p>This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
    </div>
  `;
}

export function inviteEmailHtml(opts: { inviterName: string; acceptUrl: string }) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You're invited to Aina CRM</h2>
      <p>${opts.inviterName} has invited you to join Aina CRM.</p>
      <p><a href="${opts.acceptUrl}" style="display:inline-block;padding:10px 20px;background:#dc2626;color:#fff;border-radius:6px;text-decoration:none;">Accept invite</a></p>
      <p>This link expires in 7 days.</p>
    </div>
  `;
}
