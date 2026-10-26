/**
 * Private file storage for the Command Centre (spec GV-07 / AT-05).
 *
 * file_objects holds metadata (storage key, SHA-256, MIME, size, scan
 * state); the bytes live in cc_file_blobs, AES-256-GCM encrypted. To move to
 * S3-compatible storage, replace putBlob/getBlob — nothing else touches the
 * bytes.
 *
 * Scanning: there's no antivirus engine on the current stack, so the
 * built-in scanner enforces an extension allowlist, checks the bytes match
 * the declared type's signature, and rejects executables/scripts; anything
 * failing is quarantined and never downloadable. Wiring ClamAV (or similar)
 * into scanBytes() is the follow-up for full malware scanning.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { Tx } from "./store";

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // matches nginx client_max_body_size in DEPLOY docs

const ALLOWED: Record<string, { mime: string; sig?: number[][]; offset?: number }> = {
  pdf: { mime: "application/pdf", sig: [[0x25, 0x50, 0x44, 0x46]] },
  png: { mime: "image/png", sig: [[0x89, 0x50, 0x4e, 0x47]] },
  jpg: { mime: "image/jpeg", sig: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: "image/jpeg", sig: [[0xff, 0xd8, 0xff]] },
  gif: { mime: "image/gif", sig: [[0x47, 0x49, 0x46, 0x38]] },
  webp: { mime: "image/webp", sig: [[0x52, 0x49, 0x46, 0x46]] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", sig: [[0x50, 0x4b, 0x03, 0x04]] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", sig: [[0x50, 0x4b, 0x03, 0x04]] },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", sig: [[0x50, 0x4b, 0x03, 0x04]] },
  doc: { mime: "application/msword", sig: [[0xd0, 0xcf, 0x11, 0xe0]] },
  xls: { mime: "application/vnd.ms-excel", sig: [[0xd0, 0xcf, 0x11, 0xe0]] },
  ppt: { mime: "application/vnd.ms-powerpoint", sig: [[0xd0, 0xcf, 0x11, 0xe0]] },
  txt: { mime: "text/plain" },
  csv: { mime: "text/csv" },
  md: { mime: "text/markdown" },
  vtt: { mime: "text/vtt" },
  srt: { mime: "application/x-subrip" },
  mp3: { mime: "audio/mpeg", sig: [[0x49, 0x44, 0x33], [0xff, 0xfb], [0xff, 0xf3], [0xff, 0xf2]] },
  wav: { mime: "audio/wav", sig: [[0x52, 0x49, 0x46, 0x46]] },
  m4a: { mime: "audio/mp4", sig: [[0x66, 0x74, 0x79, 0x70]], offset: 4 },
  mp4: { mime: "video/mp4", sig: [[0x66, 0x74, 0x79, 0x70]], offset: 4 },
  webm: { mime: "video/webm", sig: [[0x1a, 0x45, 0xdf, 0xa3]] },
};

const TEXT = new Set(["txt", "csv", "md", "vtt", "srt"]);

export function extOf(name: string) {
  return (name.split(".").pop() ?? "").toLowerCase();
}

/** Returns null when clean, or the quarantine reason. */
export function scanBytes(name: string, bytes: Buffer): string | null {
  const ext = extOf(name);
  const spec = ALLOWED[ext];
  if (!spec) return `.${ext || "?"} files aren't accepted`;
  if (bytes.length === 0) return "empty file";
  // Executables and scripts, whatever they're named.
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) return "Windows executable";
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return "ELF executable";
  if (bytes[0] === 0x23 && bytes[1] === 0x21) return "script";
  if (spec.sig) {
    const off = spec.offset ?? 0;
    if (!spec.sig.some((s) => s.every((b, i) => bytes[off + i] === b))) return `content doesn't match a .${ext} file`;
  }
  if (TEXT.has(ext)) {
    const head = bytes.subarray(0, 4096).toString("utf8").toLowerCase();
    if (bytes.subarray(0, 4096).includes(0)) return "binary content in a text file";
    if (/<script|<html|<iframe|javascript:/.test(head)) return "markup/script content in a text file";
  }
  return null;
}

export function mimeFor(name: string) {
  return ALLOWED[extOf(name)]?.mime ?? "application/octet-stream";
}

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

const fileKey = () => createHash("sha256").update(`cc-file-encryption:${secret()}`).digest();
export const ENCRYPTION_KEY_REF = "app-aes256gcm:v1";

async function putBlob(tx: Tx, storageKey: string, bytes: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", fileKey(), iv);
  const enc = Buffer.concat([c.update(bytes), c.final()]);
  const data = Buffer.concat([iv, c.getAuthTag(), enc]);
  await tx.ccFileBlob.create({ data: { storageKey, data } });
}

export async function getBlob(storageKey: string): Promise<Buffer | null> {
  const row = await db.ccFileBlob.findUnique({ where: { storageKey } });
  if (!row) return null;
  const buf = Buffer.from(row.data);
  const d = createDecipheriv("aes-256-gcm", fileKey(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

/** Stores and scans an upload; returns the file_objects row id and its scan status. */
export async function storeFile(
  tx: Tx,
  opts: { workspaceId: string; mfdOrgId: string | null; userId: string; fileName: string; bytes: Buffer }
): Promise<{ id: string; scanStatus: "clean" | "quarantined"; reason: string | null }> {
  if (opts.bytes.length > MAX_FILE_BYTES) throw new Error(`File exceeds the ${MAX_FILE_BYTES / 1048576}MB limit`);
  const name = opts.fileName.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(-255) || "file";
  const id = crypto.randomUUID();
  const storageKey = `cc/${opts.workspaceId}/${id}`;
  await putBlob(tx, storageKey, opts.bytes);
  await tx.ccFileObject.create({
    data: {
      id,
      workspaceId: opts.workspaceId,
      mfdOrgId: opts.mfdOrgId,
      storageKey,
      originalFilename: name,
      sha256: createHash("sha256").update(opts.bytes).digest("hex"),
      mimeType: mimeFor(name),
      sizeBytes: BigInt(opts.bytes.length),
      scanStatus: "pending",
      encryptionKeyRef: ENCRYPTION_KEY_REF,
      uploadedByUserId: opts.userId,
    },
  });
  const reason = scanBytes(name, opts.bytes);
  const scanStatus = reason ? "quarantined" : "clean";
  await tx.ccFileObject.update({ where: { id }, data: { scanStatus } });
  return { id, scanStatus, reason };
}

// ---------- short-lived, user-bound download links ----------

const TOKEN_TTL_SECONDS = 120;

function sign(fileId: string, userId: string, exp: number) {
  return createHmac("sha256", secret()).update(`cc-download:${fileId}:${userId}:${exp}`).digest("base64url");
}

export function downloadToken(fileId: string, userId: string) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  return `${exp}.${sign(fileId, userId, exp)}`;
}

export function verifyDownloadToken(token: string, fileId: string, userId: string) {
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp < Date.now() / 1000 || !sig) return false;
  const expected = Buffer.from(sign(fileId, userId, exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}
