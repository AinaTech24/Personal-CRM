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

// The base64 data-URL attachment helpers used to live here — they're shared
// with the generic Forms module now, so they moved to src/lib/uploads.ts.
// Re-exported under their old names so nothing else has to change.
export {
  MAX_DATA_URL_ATTACHMENT_BYTES as MAX_ATTACHMENT_BYTES,
  MAX_DATA_URL_FILES_PER_FIELD as MAX_FILES_PER_FIELD,
  MAX_DATA_URL_TOTAL_BYTES as MAX_TOTAL_ATTACHMENT_BYTES,
  AttachmentUploadError as OnboardingUploadError,
  parseAttachmentDataUrl,
  sanitizeAttachmentFileName,
} from "@/lib/uploads";
