export const FORM_FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "EMAIL",
  "PHONE",
  "LINK",
  "PASSWORD",
  "NUMBER",
  "DATE",
  "DROPDOWN",
  "RADIO",
  "CHECKBOX",
  "FILE_SINGLE",
  "FILE_MULTI",
  "SECTION_HEADING",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export interface FieldTypeMeta {
  type: FormFieldType;
  label: string;
  /** DROPDOWN / RADIO / CHECKBOX — has a pipe-separated choice list. */
  hasOptions: boolean;
  /** FILE_SINGLE / FILE_MULTI — collects one or more attachments. */
  isFile: boolean;
  /** SECTION_HEADING — a layout divider, not a question; never has an answer. */
  isLayoutOnly: boolean;
  /** PASSWORD — masked everywhere the answer is shown (typing it in, and every admin view), not just stored as plain text like everything else already is. */
  isSensitive: boolean;
}

export const FIELD_TYPE_META: Record<FormFieldType, FieldTypeMeta> = {
  SHORT_TEXT: { type: "SHORT_TEXT", label: "Short Text", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false },
  LONG_TEXT: { type: "LONG_TEXT", label: "Long Text", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false },
  EMAIL: { type: "EMAIL", label: "Email", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false },
  PHONE: { type: "PHONE", label: "Phone", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false },
  LINK: { type: "LINK", label: "Link", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false },
  PASSWORD: { type: "PASSWORD", label: "Password", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: true },
  NUMBER: { type: "NUMBER", label: "Number", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false },
  DATE: { type: "DATE", label: "Date", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false },
  DROPDOWN: { type: "DROPDOWN", label: "Dropdown", hasOptions: true, isFile: false, isLayoutOnly: false, isSensitive: false },
  RADIO: { type: "RADIO", label: "Radio Buttons", hasOptions: true, isFile: false, isLayoutOnly: false, isSensitive: false },
  CHECKBOX: { type: "CHECKBOX", label: "Checkboxes", hasOptions: true, isFile: false, isLayoutOnly: false, isSensitive: false },
  FILE_SINGLE: { type: "FILE_SINGLE", label: "File Upload", hasOptions: false, isFile: true, isLayoutOnly: false, isSensitive: false },
  FILE_MULTI: { type: "FILE_MULTI", label: "Multiple Files", hasOptions: false, isFile: true, isLayoutOnly: false, isSensitive: false },
  SECTION_HEADING: { type: "SECTION_HEADING", label: "Section Heading", hasOptions: false, isFile: false, isLayoutOnly: true, isSensitive: false },
};

export const FIELD_PALETTE: FormFieldType[] = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "EMAIL",
  "PHONE",
  "LINK",
  "PASSWORD",
  "NUMBER",
  "DATE",
  "DROPDOWN",
  "RADIO",
  "CHECKBOX",
  "FILE_SINGLE",
  "FILE_MULTI",
  "SECTION_HEADING",
];

/**
 * Builder-only convenience: a palette "shortcut" that inserts a ready-made
 * pair of fields (an identifier field + its PASSWORD) in one click, instead
 * of a combined single control — the data model is one answer per field
 * (see FormAnswer), so "Email + Password" is two ordinary fields, not a
 * new type. Matches the pattern already used by hand in existing forms
 * (e.g. an "... Login (Email or Mobile Number)" field followed by its own
 * "... Login Password" field).
 */
export interface FieldPairShortcut {
  key: string;
  label: string;
  fields: { type: FormFieldType; label: string }[];
}

export const FIELD_PAIR_SHORTCUTS: FieldPairShortcut[] = [
  {
    key: "EMAIL_PASSWORD",
    label: "Email + Password",
    fields: [
      { type: "EMAIL", label: "Email" },
      { type: "PASSWORD", label: "Password" },
    ],
  },
  {
    key: "PHONE_PASSWORD",
    label: "Phone + Password",
    fields: [
      { type: "PHONE", label: "Phone" },
      { type: "PASSWORD", label: "Password" },
    ],
  },
];

/** DROPDOWN/RADIO/CHECKBOX choices are stored as one pipe-separated string. */
export function parseFieldOptions(options: string | null | undefined): string[] {
  return (options ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeFieldOptions(options: string[]): string {
  return options.map((s) => s.trim()).filter(Boolean).join("|");
}

/** What kind of preview an uploaded file gets: a real thumbnail for an image, otherwise a type-appropriate icon. */
export type AttachmentKind = "image" | "spreadsheet" | "archive" | "file";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const SPREADSHEET_EXTENSIONS = new Set(["xls", "xlsx"]);
const ARCHIVE_EXTENSIONS = new Set(["zip"]);

export function attachmentKindFor(fileName: string): AttachmentKind {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (SPREADSHEET_EXTENSIONS.has(ext)) return "spreadsheet";
  if (ARCHIVE_EXTENSIONS.has(ext)) return "archive";
  return "file";
}
