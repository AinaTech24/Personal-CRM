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
  "PAGE_BREAK",
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
  /**
   * Which validation rules the builder offers for this type: "length" for
   * minLength/maxLength/pattern on a text-like answer, "range" for
   * minValue/maxValue on NUMBER, "none" for types with no free-text value
   * to constrain (DATE, choices, files, the layout-only heading).
   */
  validation: "length" | "range" | "none";
}

export const FIELD_TYPE_META: Record<FormFieldType, FieldTypeMeta> = {
  SHORT_TEXT: { type: "SHORT_TEXT", label: "Short Text", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "length" },
  LONG_TEXT: { type: "LONG_TEXT", label: "Long Text", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "length" },
  EMAIL: { type: "EMAIL", label: "Email", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "length" },
  PHONE: { type: "PHONE", label: "Phone", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "length" },
  LINK: { type: "LINK", label: "Link", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "length" },
  PASSWORD: { type: "PASSWORD", label: "Password", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: true, validation: "length" },
  NUMBER: { type: "NUMBER", label: "Number", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "range" },
  DATE: { type: "DATE", label: "Date", hasOptions: false, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "none" },
  DROPDOWN: { type: "DROPDOWN", label: "Dropdown", hasOptions: true, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "none" },
  RADIO: { type: "RADIO", label: "Radio Buttons", hasOptions: true, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "none" },
  CHECKBOX: { type: "CHECKBOX", label: "Checkboxes", hasOptions: true, isFile: false, isLayoutOnly: false, isSensitive: false, validation: "none" },
  FILE_SINGLE: { type: "FILE_SINGLE", label: "File Upload", hasOptions: false, isFile: true, isLayoutOnly: false, isSensitive: false, validation: "none" },
  FILE_MULTI: { type: "FILE_MULTI", label: "Multiple Files", hasOptions: false, isFile: true, isLayoutOnly: false, isSensitive: false, validation: "none" },
  SECTION_HEADING: { type: "SECTION_HEADING", label: "Section Heading", hasOptions: false, isFile: false, isLayoutOnly: true, isSensitive: false, validation: "none" },
  PAGE_BREAK: { type: "PAGE_BREAK", label: "Page Break", hasOptions: false, isFile: false, isLayoutOnly: true, isSensitive: false, validation: "none" },
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
  "PAGE_BREAK",
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

/** The subset of a FormField's columns a validity check needs — matches the Prisma shape directly. */
export interface FieldValidationRules {
  type: FormFieldType;
  label: string;
  minLength?: number | null;
  maxLength?: number | null;
  minValue?: number | null;
  maxValue?: number | null;
  pattern?: string | null;
}

/**
 * The one place min/max/pattern rules are actually checked, shared by the
 * public form's client-side submit handler (for instant feedback) and the
 * submit API route (the real gate — the client check never substitutes for
 * this). Only called on a non-empty trimmed string; required/empty-value
 * handling stays with each caller since file/checkbox fields have their own
 * notion of "empty" this helper doesn't need to know about. Returns the
 * first problem found, or null when the value is acceptable.
 */
export function validateFieldValue(field: FieldValidationRules, value: string): string | null {
  if (field.type === "NUMBER") {
    const n = Number(value);
    if (Number.isNaN(n)) return `"${field.label}" must be a number`;
    if (field.minValue != null && n < field.minValue) return `"${field.label}" must be at least ${field.minValue}`;
    if (field.maxValue != null && n > field.maxValue) return `"${field.label}" must be at most ${field.maxValue}`;
    return null;
  }
  if (field.minLength != null && value.length < field.minLength) {
    return `"${field.label}" must be at least ${field.minLength} character${field.minLength === 1 ? "" : "s"}`;
  }
  if (field.maxLength != null && value.length > field.maxLength) {
    return `"${field.label}" must be at most ${field.maxLength} character${field.maxLength === 1 ? "" : "s"}`;
  }
  if (field.pattern) {
    let matches = true;
    try {
      matches = new RegExp(field.pattern).test(value);
    } catch {
      // An invalid pattern (shouldn't happen - the builder validates it before saving) never blocks a real submission.
    }
    if (!matches) return `"${field.label}" doesn't match the required format`;
  }
  return null;
}

export const CONDITION_OPERATORS = [
  { value: "equals", label: "is" },
  { value: "not_equals", label: "is not" },
  { value: "contains", label: "contains" },
  { value: "is_filled", label: "is answered" },
  { value: "is_empty", label: "is empty" },
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]["value"];

export interface FieldCondition {
  conditionFieldId?: string | null;
  conditionOperator?: string | null;
  conditionValue?: string | null;
}

/**
 * Whether a conditional field should currently be shown, given the other
 * answers collected so far. No condition at all (conditionFieldId unset)
 * always shows. `answers` maps fieldId -> the answer as one string, the
 * same pipe-separated convention CHECKBOX already uses elsewhere — which
 * is why "equals"/"not_equals" check membership in a pipe-split list
 * rather than a straight `===`: it's the same comparison for an ordinary
 * single-value answer (split("|") on a plain string is just [that string])
 * and for a CHECKBOX's several selections, with no separate case needed.
 */
export function isFieldVisible(field: FieldCondition, answers: Record<string, string | undefined>): boolean {
  if (!field.conditionFieldId || !field.conditionOperator) return true;
  const raw = (answers[field.conditionFieldId] ?? "").trim();
  const target = (field.conditionValue ?? "").trim().toLowerCase();
  switch (field.conditionOperator) {
    case "is_filled":
      return raw.length > 0;
    case "is_empty":
      return raw.length === 0;
    case "equals":
      return raw.split("|").some((v) => v.trim().toLowerCase() === target);
    case "not_equals":
      return !raw.split("|").some((v) => v.trim().toLowerCase() === target);
    case "contains":
      return raw.toLowerCase().includes(target);
    default:
      return true;
  }
}

/**
 * Splits an ordered field list into pages at each PAGE_BREAK — the break
 * itself is layout only, like SECTION_HEADING, and never appears in any
 * page. Two breaks in a row (or a trailing one) would otherwise produce an
 * empty page, so empty pages are dropped; a form with no breaks at all, or
 * none left after dropping empties, is just one page.
 */
export function splitIntoPages<T extends { type: FormFieldType }>(fields: T[]): T[][] {
  const pages: T[][] = [[]];
  for (const f of fields) {
    if (f.type === "PAGE_BREAK") {
      pages.push([]);
      continue;
    }
    pages[pages.length - 1].push(f);
  }
  const nonEmpty = pages.filter((p) => p.length > 0);
  return nonEmpty.length ? nonEmpty : [[]];
}
