import { randomBytes } from "crypto";

/** Shared ceiling for any single upload — routes also check this themselves
 *  against the multipart size before reading the body, but the check is
 *  duplicated here so the helper is safe even if a future caller forgets to. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

export class UploadValidationError extends Error {}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

/**
 * Magic-byte signatures for extensions whose declared type is easy to check
 * and worth checking — catches a renamed executable or script masquerading as
 * a document/image. Deliberately excludes text-ish formats (txt/csv/json) that
 * have no reliable signature; those are just extension-labeled, same as before.
 * docx/xlsx/pptx/zip all share the ZIP local-file-header signature.
 */
const SIGNATURES: Record<string, readonly (readonly number[])[]> = {
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  png: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  jpg: [[0xff, 0xd8, 0xff]],
  jpeg: [[0xff, 0xd8, 0xff]],
  gif: [[0x47, 0x49, 0x46, 0x38]], // GIF8
  zip: [[0x50, 0x4b, 0x03, 0x04]],
  docx: [[0x50, 0x4b, 0x03, 0x04]],
  xlsx: [[0x50, 0x4b, 0x03, 0x04]],
  pptx: [[0x50, 0x4b, 0x03, 0x04]],
  doc: [[0xd0, 0xcf, 0x11, 0xe0]], // legacy OLE compound file (doc/xls/ppt)
  xls: [[0xd0, 0xcf, 0x11, 0xe0]],
  ppt: [[0xd0, 0xcf, 0x11, 0xe0]],
};

function matchesSignature(buffer: Buffer, ext: string): boolean {
  const candidates = SIGNATURES[ext];
  if (!candidates) return true; // no known signature for this extension — nothing to check
  return candidates.some((sig) => sig.every((byte, i) => buffer[i] === byte));
}

/**
 * Reads an uploaded file into a base64 string for storage in MySQL. Returns a
 * stable `filePath` key (used in the file-serving URL), the display file name,
 * and the base64-encoded bytes.
 *
 * Validates the bytes against what the extension claims to be, for the
 * formats that have a checkable signature — a file renamed to look like a
 * PDF or an office document but actually holding something else (a script, an
 * executable) is rejected here rather than stored and later served back with
 * whatever Content-Type its fake extension implies.
 */
async function readUploadedFile(scope: "tasks" | "projects" | "reports" | "client-images" | "expenses", entityId: string, file: File) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(`File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit`);
  }

  const safeName = sanitizeFileName(file.name || "file");
  const uniqueName = `${randomBytes(6).toString("hex")}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const ext = (file.name || "").split(".").pop()?.toLowerCase() ?? "";
  if (!matchesSignature(buffer, ext)) {
    throw new UploadValidationError(`File content doesn't match its .${ext} extension`);
  }

  return {
    filePath: `${scope}/${entityId}/${uniqueName}`,
    fileName: file.name || safeName,
    data: buffer.toString("base64"),
  };
}

export function saveTaskAttachment(taskId: string, file: File) {
  return readUploadedFile("tasks", taskId, file);
}

export function saveProjectDocument(projectId: string, file: File) {
  return readUploadedFile("projects", projectId, file);
}

export function saveReportFile(reportId: string, file: File) {
  return readUploadedFile("reports", reportId, file);
}

export function saveExpenseReceipt(expenseId: string, file: File) {
  return readUploadedFile("expenses", expenseId, file);
}

/// Excludes SVG deliberately — it can carry a <script>, the same stored-XSS
/// concern the uploads-serving route already guards against for other file
/// types by forcing it to download rather than render inline.
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

export async function saveClientImage(clientId: string, file: File) {
  const ext = (file.name || "").split(".").pop()?.toLowerCase() ?? "";
  if (!IMAGE_EXTENSIONS.has(ext)) {
    throw new UploadValidationError("Only PNG, JPG, GIF, or WEBP images are allowed");
  }
  return readUploadedFile("client-images", clientId, file);
}

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function mimeTypeFor(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

// ---------- Base64 data-URL uploads (public, unauthenticated forms) ----------
//
// The task-/project-/report-/client-image routes above all take a multipart
// `File` from an authenticated request. A public form (the Website Onboarding
// Form, and any form built with the Forms module) has no session to key an
// upload to, so it submits one JSON body with `data:<mime>;base64,...` strings
// instead — these helpers validate and decode that shape.

export const MAX_DATA_URL_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB per file
export const MAX_DATA_URL_FILES_PER_FIELD = 8;
export const MAX_DATA_URL_TOTAL_BYTES = 30 * 1024 * 1024; // 30MB per submission

const ALLOWED_DATA_URL_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export class AttachmentUploadError extends Error {}

/** Parses a `data:<mime>;base64,<...>` string, validating the MIME type and decoded size. */
export function parseAttachmentDataUrl(dataUrl: string, fileName: string): { mime: string; base64: string; bytes: number } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new AttachmentUploadError(`"${fileName}" isn't a valid file upload`);
  const [, mime, base64] = match;
  if (!ALLOWED_DATA_URL_MIME_TYPES.has(mime)) {
    throw new AttachmentUploadError(`"${fileName}" isn't an accepted file type (image, PDF, Office document, or ZIP)`);
  }
  // Decoded byte length from a base64 string, without actually allocating the buffer yet.
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_DATA_URL_ATTACHMENT_BYTES) {
    throw new AttachmentUploadError(`"${fileName}" exceeds the ${MAX_DATA_URL_ATTACHMENT_BYTES / (1024 * 1024)}MB limit`);
  }
  return { mime, base64, bytes };
}

/** Strips anything that isn't safe to carry through as a display file name. */
export function sanitizeAttachmentFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(-150) || "file";
}
