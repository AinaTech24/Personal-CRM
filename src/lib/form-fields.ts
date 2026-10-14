export const FORM_FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "EMAIL",
  "PHONE",
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
}

export const FIELD_TYPE_META: Record<FormFieldType, FieldTypeMeta> = {
  SHORT_TEXT: { type: "SHORT_TEXT", label: "Short Text", hasOptions: false, isFile: false, isLayoutOnly: false },
  LONG_TEXT: { type: "LONG_TEXT", label: "Long Text", hasOptions: false, isFile: false, isLayoutOnly: false },
  EMAIL: { type: "EMAIL", label: "Email", hasOptions: false, isFile: false, isLayoutOnly: false },
  PHONE: { type: "PHONE", label: "Phone", hasOptions: false, isFile: false, isLayoutOnly: false },
  NUMBER: { type: "NUMBER", label: "Number", hasOptions: false, isFile: false, isLayoutOnly: false },
  DATE: { type: "DATE", label: "Date", hasOptions: false, isFile: false, isLayoutOnly: false },
  DROPDOWN: { type: "DROPDOWN", label: "Dropdown", hasOptions: true, isFile: false, isLayoutOnly: false },
  RADIO: { type: "RADIO", label: "Radio Buttons", hasOptions: true, isFile: false, isLayoutOnly: false },
  CHECKBOX: { type: "CHECKBOX", label: "Checkboxes", hasOptions: true, isFile: false, isLayoutOnly: false },
  FILE_SINGLE: { type: "FILE_SINGLE", label: "File Upload", hasOptions: false, isFile: true, isLayoutOnly: false },
  FILE_MULTI: { type: "FILE_MULTI", label: "Multiple Files", hasOptions: false, isFile: true, isLayoutOnly: false },
  SECTION_HEADING: { type: "SECTION_HEADING", label: "Section Heading", hasOptions: false, isFile: false, isLayoutOnly: true },
};

export const FIELD_PALETTE: FormFieldType[] = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "EMAIL",
  "PHONE",
  "NUMBER",
  "DATE",
  "DROPDOWN",
  "RADIO",
  "CHECKBOX",
  "FILE_SINGLE",
  "FILE_MULTI",
  "SECTION_HEADING",
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
