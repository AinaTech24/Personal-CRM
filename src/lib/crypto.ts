import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * AES-256-GCM encryption for secrets stored at rest — currently just social
 * media platform credentials (src/app/api/social/.../platforms). Nothing
 * else in this app stores a reversible secret; passwords and PINs are
 * one-way bcrypt hashes, which is a different job (verify a guess, never
 * recover the original) from this one (a team member needs to actually log
 * into the client's Instagram later, so the plaintext has to come back).
 *
 * Needs CREDENTIALS_ENCRYPTION_KEY set. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Unlike VAPID_PUBLIC_KEY (push is best-effort and silently no-ops without
 * it), a missing key here throws — better to refuse the save loudly than
 * store a credential some other way, or silently drop it.
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export const credentialsEncryptionConfigured = !!process.env.CREDENTIALS_ENCRYPTION_KEY;

function getKey(): Buffer {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set — can't store or read platform credentials.");
  }
  // scrypt derives exactly 32 bytes regardless of the input secret's own
  // length, so ops doesn't need to generate a key of a specific byte size —
  // any reasonably long random string works as the env var.
  return scryptSync(secret, "aina-crm-social-credentials", 32);
}

/** iv:authTag:ciphertext, each base64 — a fresh random IV every call, so encrypting the same value twice gives different output. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload");
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}
