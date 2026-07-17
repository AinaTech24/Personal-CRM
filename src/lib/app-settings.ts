import { db } from "@/lib/db";

/**
 * The base URL for links in outbound email (invites, sign-in codes).
 *
 * Admin-configured value wins, falling back to APP_URL so existing deployments
 * keep working unchanged. This is DB-backed rather than env-only because it's
 * the one env value that legitimately changes without a redeploy — moving to a
 * new domain otherwise sends every invite link to the old host, and the failure
 * is silent: the email sends fine, the link just goes nowhere useful.
 */
export async function getAppUrl(): Promise<string | null> {
  const row = await db.appSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  const url = row?.appUrl || process.env.APP_URL;
  if (!url) return null;
  // Trailing slashes would produce "https://host//invite/token".
  return url.replace(/\/+$/, "");
}
