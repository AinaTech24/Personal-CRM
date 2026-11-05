import crypto from "node:crypto";
import { OTP } from "otplib";

const ISSUER = "Aina CRM";
const otp = new OTP({ strategy: "totp" });

/** Base32-encoded TOTP secret, to be shown as a QR code + manual key during setup. */
export function generateTotpSecret(): string {
  return otp.generateSecret();
}

/** otpauth:// URI for the setup QR code — scannable by Google/Microsoft Authenticator, Authy, etc. */
export function totpKeyUri(email: string, secret: string) {
  return otp.generateURI({ issuer: ISSUER, label: email, secret });
}

/** Accepts the current code or one step either side, to tolerate minor clock drift. */
export async function verifyTotpCode(secret: string, token: string): Promise<boolean> {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const result = await otp.verify({ secret, token: cleaned, epochTolerance: 30 });
  return result.valid;
}

// Excludes 0/O and 1/I so a handwritten backup code isn't ambiguous.
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomBackupCode(): string {
  return Array.from({ length: 8 }, () => BACKUP_CODE_ALPHABET[crypto.randomInt(BACKUP_CODE_ALPHABET.length)]).join(
    ""
  );
}

/** Raw (unformatted) one-time backup codes — hash each with hashPassword before storing. */
export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, randomBackupCode);
}

/** `"ABCD1234"` -> `"ABCD-1234"`, for display only — never stored or hashed in this form. */
export function formatBackupCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Strips whatever punctuation/whitespace the user typed so entry is forgiving. */
export function normalizeBackupCode(input: string) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
