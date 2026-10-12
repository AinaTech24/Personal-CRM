import type { Role } from "@/generated/prisma/enums";
import { isAdmin } from "@/lib/permissions";

interface DepartmentUser {
  id: string;
  role: Role;
  departmentId: string | null;
  department: { name: string } | null;
}

/**
 * Admins, plus anyone in whatever an admin has named the Development
 * department — there's no fixed slug for it (departments are freeform), so
 * this matches on the name loosely ("Development", "Web Development", ...)
 * rather than requiring an exact row to exist.
 */
export function canViewOnboardingSubmissions(user: DepartmentUser): boolean {
  if (isAdmin(user)) return true;
  return !!user.department?.name.toLowerCase().includes("development");
}

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB per file
export const MAX_FILES_PER_FIELD = 8;
export const MAX_TOTAL_ATTACHMENT_BYTES = 30 * 1024 * 1024; // 30MB per submission

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export class OnboardingUploadError extends Error {}

/** Parses a `data:<mime>;base64,<...>` string, validating the MIME type and decoded size. */
export function parseAttachmentDataUrl(dataUrl: string, fileName: string): { mime: string; base64: string; bytes: number } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new OnboardingUploadError(`"${fileName}" isn't a valid file upload`);
  const [, mime, base64] = match;
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mime)) {
    throw new OnboardingUploadError(`"${fileName}" must be an image or PDF`);
  }
  // Decoded byte length from a base64 string, without actually allocating the buffer yet.
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_ATTACHMENT_BYTES) {
    throw new OnboardingUploadError(`"${fileName}" exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit`);
  }
  return { mime, base64, bytes };
}

/** Strips anything that isn't safe to carry through as a display file name. */
export function sanitizeAttachmentFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ._-]/g, "_").slice(-150) || "file";
}
