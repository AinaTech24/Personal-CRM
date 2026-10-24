import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard GCM nonce size.

/**
 * Key for secrets stored at rest (Password Manager entries, SMTP password) —
 * separate from JWT_SECRET, which signs session tokens rather than
 * encrypting data. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  return key;
}

/** `<iv>:<authTag>:<ciphertext>`, each hex-encoded — distinguishable from legacy plaintext by isEncryptedSecret. */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

/** True if a stored value is in encryptSecret's format, as opposed to a pre-encryption plaintext row. */
export function isEncryptedSecret(stored: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i.test(stored);
}

/**
 * Decrypts a value written by encryptSecret. Falls back to returning the
 * value unchanged when it doesn't look encrypted — a safety net for a row
 * written before ENCRYPTION_KEY existed that the one-time migration script
 * (scripts/encrypt-stored-secrets.ts) hasn't reached yet, so a password
 * never surfaces as broken ciphertext to the person revealing it.
 */
export function decryptSecret(stored: string): string {
  if (!isEncryptedSecret(stored)) return stored;
  const [ivHex, tagHex, dataHex] = stored.split(":");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return plain.toString("utf8");
}
