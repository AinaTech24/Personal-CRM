import { randomBytes } from "crypto";

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

/**
 * Reads an uploaded file into a base64 string for storage in MySQL. Returns a
 * stable `filePath` key (used in the file-serving URL), the display file name,
 * and the base64-encoded bytes.
 */
async function readUploadedFile(scope: "tasks" | "projects", entityId: string, file: File) {
  const safeName = sanitizeFileName(file.name || "file");
  const uniqueName = `${randomBytes(6).toString("hex")}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

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
