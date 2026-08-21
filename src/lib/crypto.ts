import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/**
 * Symmetric encryption for the Password Manager's stored credentials —
 * AES-256-GCM, keyed by CREDENTIALS_ENCRYPTION_KEY (a 32-byte key,
 * base64-encoded in the environment: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
 *
 * Nothing else in this app currently encrypts secrets at rest (SMTP and
 * social platform passwords are stored plain, by explicit earlier decision)
 * — this is deliberately different because the whole point of a password
 * manager is safety if the database is ever read directly.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set — generate one with " +
        `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` +
        " and add it to the environment."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes.");
  }
  return key;
}

/** Encrypts `plaintext` to a single base64 blob: iv (12 bytes) + authTag (16 bytes) + ciphertext. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Reverses encryptSecret. Throws if the blob is malformed or the auth tag doesn't verify (wrong key, or tampered). */
export function decryptSecret(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) throw new Error("Malformed ciphertext blob");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
