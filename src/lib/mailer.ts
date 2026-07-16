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

function makeTransport(cfg: ResolvedConfig) {
  // Built as a variable (not an inline literal) so the extra `family` field —
  // real nodemailer/Node option, just missing from @types/nodemailer — doesn't
  // trip up createTransport's overload resolution via excess-property checks.
  const options = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
    // Force IPv4 — some hosts (e.g. Render) resolve mail hosts like Gmail to an
    // IPv6 address first but don't actually have outbound IPv6 routing, which
    // fails with ENETUNREACH before the connection is even attempted.
    family: 4,
  };
  return nodemailer.createTransport(options);
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

  await makeTransport(cfg).sendMail({ from: cfg.from, to, subject, html });
}

/** Verifies the current SMTP configuration by opening a connection. Returns an error message if it fails. */
export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const cfg = await resolveConfig();
  if (!cfg) return { ok: false, error: "SMTP is not configured" };
  try {
    await makeTransport(cfg).verify();
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
