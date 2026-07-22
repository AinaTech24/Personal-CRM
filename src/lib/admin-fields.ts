/**
 * What kind of input a record field needs.
 *
 * Inferred from the value rather than declared per module. A hand-written map
 * across seven entities would be long, and — as the quotationNumber/state bugs
 * showed — quietly wrong wherever it drifted from the schema. Inference has its
 * own limits (see `editableFields`), so it is deliberately conservative: a
 * field it can't classify confidently isn't offered for editing at all.
 */

export type FieldKind = "text" | "textarea" | "number" | "boolean" | "date" | "enum";

export interface EditableField {
  key: string;
  label: string;
  kind: FieldKind;
  value: string | number | boolean | null;
  /** For `enum`, the values seen across the loaded records. */
  options?: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;
/** SCREAMING_SNAKE — how every enum in this schema is stored. */
const ENUM_LIKE = /^[A-Z][A-Z0-9_]*$/;

/** `createdAt` → "Created at". */
export function humanizeKey(key: string) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Fields of a record that can be safely offered for editing.
 *
 * Excluded, and why:
 *  - ids and foreign keys: changing a relation needs a picker of valid targets,
 *    not a free-text box that would happily write a broken reference.
 *  - createdAt / updatedAt: the database owns these.
 *  - nested objects and arrays: they're other records, edited in their own module.
 *  - base64 blobs: a file field, not a text field.
 */
export function editableFields(row: Record<string, unknown>, allRows: Record<string, unknown>[]): EditableField[] {
  const out: EditableField[] = [];

  for (const [key, value] of Object.entries(row)) {
    if (key === "id" || key.endsWith("Id") || key === "_count") continue;
    if (key === "createdAt" || key === "updatedAt") continue;
    if (value !== null && typeof value === "object") continue;
    if (typeof value === "string" && value.startsWith("data:")) continue;

    const base = { key, label: humanizeKey(key) };

    if (typeof value === "boolean") {
      out.push({ ...base, kind: "boolean", value });
      continue;
    }
    if (typeof value === "number") {
      out.push({ ...base, kind: "number", value });
      continue;
    }
    if (typeof value === "string") {
      if (ISO_DATE.test(value)) {
        out.push({ ...base, kind: "date", value });
        continue;
      }
      if (ENUM_LIKE.test(value)) {
        // Options gathered from every record, so a status only one row uses is
        // still offered — the current row alone would give a list of one.
        const options = [
          ...new Set(
            allRows
              .map((r) => r[key])
              .filter((v): v is string => typeof v === "string" && ENUM_LIKE.test(v))
          ),
        ].sort();
        out.push({ ...base, kind: "enum", value, options });
        continue;
      }
      out.push({ ...base, kind: value.length > 80 ? "textarea" : "text", value });
      continue;
    }
    // null: nothing to infer a type from, so fall back to free text — the
    // server still validates whatever gets sent.
    if (value === null) out.push({ ...base, kind: "text", value: null });
  }

  return out;
}

/** The value to send back, converted from what the input produced. */
export function coerceForSave(kind: FieldKind, raw: string | boolean): unknown {
  if (kind === "boolean") return Boolean(raw);
  if (kind === "number") {
    if (raw === "" || raw === null) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  }
  if (kind === "date") {
    if (!raw) return null;
    const d = new Date(String(raw));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Empty text clears the field rather than writing "".
  return raw === "" ? null : raw;
}

/** A date value in the shape `<input type="date">` expects. */
export function toDateInput(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
