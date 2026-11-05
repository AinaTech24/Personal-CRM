import { lookup } from "node:dns/promises";
import net from "node:net";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { emailButton, emailLayout, getCompanyBrand } from "@/lib/email-template";

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
  const password = (row?.password ? decryptSecret(row.password) : null) || process.env.SMTP_PASSWORD;
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

export async function resetCodeEmailHtml(opts: { name: string; code: string }) {
  return emailLayout({
    brand: await getCompanyBrand(),
    heading: "Your sign-in code",
    bodyHtml: `
      <p style="margin:0 0 16px;color:#555;">Hi ${opts.name}, use the code below to sign in:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:0 0 16px;color:#111;">${opts.code}</p>
      <p style="margin:0;color:#555;">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
    `,
  });
}

export async function pinResetCodeEmailHtml(opts: { name: string; code: string }) {
  return emailLayout({
    brand: await getCompanyBrand(),
    heading: "Reset your PIN",
    bodyHtml: `
      <p style="margin:0 0 16px;color:#555;">Hi ${opts.name}, use the code below to reset your sign-in PIN:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:0 0 16px;color:#111;">${opts.code}</p>
      <p style="margin:0;color:#555;">This code expires in 10 minutes. If you didn't request it, you can ignore this email — your PIN stays unchanged.</p>
    `,
  });
}

/** Sent to the affected user, not the admin — a security notice, not a credential
 *  (the admin already knows the PIN they just set, and shares it out of band). */
export async function pinResetByAdminEmailHtml(opts: { name: string; adminName: string }) {
  return emailLayout({
    brand: await getCompanyBrand(),
    heading: "Your PIN was reset",
    bodyHtml: `
      <p style="margin:0 0 16px;color:#555;">Hi ${opts.name}, ${opts.adminName} reset your sign-in PIN. Ask them for your new PIN if they haven't shared it yet.</p>
      <p style="margin:0;color:#555;">If this wasn't expected, contact your admin right away.</p>
    `,
  });
}

/** Short "Browser on OS" label from a raw user-agent string — a trimmed-down version of the one the Settings UI uses client-side, since this runs server-side in the mailer. */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "an unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Chrome\//.test(userAgent)
      ? "Chrome"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "a browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

/** How the account holder actually authenticated — shown in the new-sign-in alert so they can tell a real passkey/PIN sign-in from one they don't recognize. */
export type SignInMethod = "password" | "pin" | "passkey" | "email_code";

const SIGN_IN_METHOD_LABEL: Record<SignInMethod, string> = {
  password: "your email and password",
  pin: "your mobile number and PIN",
  passkey: "a passkey",
  email_code: "an emailed sign-in code",
};

/**
 * A small pulsing-ring key graphic for a passkey sign-in — most email clients
 * (Gmail, Outlook) strip the <style> block and just show the static key in
 * its resting state; clients that keep it (Apple Mail, Thunderbird, iOS/Mac
 * Outlook) animate the ring. Either way it degrades to a plain graphic, never
 * to broken markup.
 */
function passkeyGraphic(): string {
  return `
    <style>@keyframes pkPulse{0%{transform:scale(.85);opacity:.7}70%{transform:scale(1.6);opacity:0}100%{transform:scale(1.6);opacity:0}}</style>
    <div style="text-align:center;margin:4px 0 20px;">
      <div style="position:relative;display:inline-block;width:64px;height:64px;">
        <div style="position:absolute;inset:0;border-radius:50%;border:2px solid #dc2626;animation:pkPulse 1.8s ease-out infinite;"></div>
        <div style="position:relative;display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:#fef2f2;font-size:30px;line-height:1;">🔑</div>
      </div>
    </div>
  `;
}

export async function newSignInEmailHtml(opts: { name: string; userAgent: string | null; ip: string | null; method: SignInMethod }) {
  const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const brand = await getCompanyBrand();
  const methodLabel = SIGN_IN_METHOD_LABEL[opts.method];
  return emailLayout({
    brand,
    heading: "New sign-in from an unrecognized device",
    bodyHtml: `
      ${opts.method === "passkey" ? passkeyGraphic() : ""}
      <p style="margin:0 0 16px;color:#555;">Hi ${opts.name}, your account was just signed in to using ${methodLabel}, from ${deviceLabel(opts.userAgent)}${opts.ip ? ` (${opts.ip})` : ""} at ${when} IST — a device we haven't seen you sign in from before.</p>
      <p style="margin:0;color:#555;">If this was you, no action is needed. If it wasn't, change your password right away and review your active sessions under Settings &gt; Security.</p>
    `,
    footerNote: `Turn these alerts off anytime under Settings &gt; Security &gt; "Email me on a new sign-in". This is an automated message from ${brand.name}.`,
  });
}

export async function inviteEmailHtml(opts: { inviterName: string; acceptUrl: string }) {
  return emailLayout({
    brand: await getCompanyBrand(),
    heading: "You're invited",
    bodyHtml: `
      <p style="margin:0 0 20px;color:#555;">${opts.inviterName} has invited you to join. Click below to set your password and get started.</p>
      <p style="margin:0 0 20px;">${emailButton("Accept invite", opts.acceptUrl)}</p>
      <p style="margin:0;color:#555;">This link expires in 7 days.</p>
    `,
  });
}

export async function formSubmittedThankYouEmailHtml(opts: { formTitle: string }) {
  return emailLayout({
    brand: await getCompanyBrand(),
    heading: "Thank you for reaching out",
    bodyHtml: `
      <p style="margin:0;color:#555;">Thank you for filling out "${opts.formTitle}". We've received your response and will connect with you soon.</p>
    `,
  });
}

export async function leaveDecidedEmailHtml(opts: {
  name: string;
  decision: "APPROVED" | "REJECTED";
  categoryLabel: string;
  startDate: string;
  endDate: string;
  days: number;
  actorName: string;
}) {
  const { name, decision, categoryLabel, startDate, endDate, days, actorName } = opts;
  const approved = decision === "APPROVED";
  const dateRange = startDate === endDate ? startDate : `${startDate} – ${endDate}`;
  return emailLayout({
    brand: await getCompanyBrand(),
    heading: approved ? "Your leave request was approved" : "Your leave request was rejected",
    bodyHtml: `
      <p style="margin:0 0 16px;color:#555;">Hi ${name}, ${actorName} ${approved ? "approved" : "rejected"} your ${categoryLabel.toLowerCase()} leave request for ${dateRange} (${days} day${days === 1 ? "" : "s"}).</p>
      <p style="margin:0;color:#555;">${approved ? "It's now reflected on your attendance." : "Reach out to your admin if you have questions."}</p>
    `,
  });
}

export async function taskAssignedEmailHtml(opts: { name: string; taskTitle: string; actorName: string; dueDate: string | null; taskUrl: string }) {
  const { name, taskTitle, actorName, dueDate, taskUrl } = opts;
  return emailLayout({
    brand: await getCompanyBrand(),
    heading: "A new task was assigned to you",
    bodyHtml: `
      <p style="margin:0 0 20px;color:#555;">Hi ${name}, ${actorName} assigned you the task "${taskTitle}"${dueDate ? `, due ${dueDate}` : ""}.</p>
      <p style="margin:0;">${emailButton("View task", taskUrl)}</p>
    `,
  });
}
