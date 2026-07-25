/**
 * Pure validation/normalization for the mobile+PIN sign-in method. Kept apart
 * from src/lib/auth.ts deliberately — that file imports db.ts, which eagerly
 * builds a Prisma client from DATABASE_URL, so anything importing it can't be
 * unit tested without a live database configured. These have no such
 * dependency.
 */

/** A sign-in PIN is always exactly 6 digits — no leading-zero stripping, no separators. */
export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/**
 * Strips everything but digits and drops a leading trunk "0" or India's "91"
 * country code, so "+91 98765 43210", "09876543210", and "9876543210" all
 * normalize to the same 10-digit key. This is what mobile-based login looks
 * up against and what the profile route stores, so the same number always
 * matches itself regardless of how someone happened to type it.
 */
export function normalizeMobile(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  while (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  return digits;
}

export function isValidMobile(raw: string): boolean {
  return normalizeMobile(raw).length === 10;
}
