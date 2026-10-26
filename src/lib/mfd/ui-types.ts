/**
 * Serializable field/table descriptions handed from server pages to the
 * Command Centre's client components (the full generated catalog stays on
 * the server — it's far too large for the browser bundle).
 */
import type { FieldKind } from "./catalog-types";

export interface FieldMeta {
  column: string;
  label: string;
  kind: FieldKind;
  required: "Y" | "N" | "C";
  maxLength?: number;
  scale?: number;
  help: string;
  /** Picklist options, when the field is an enum. */
  options?: { value: string; label: string }[];
  /** Reference target: the table, and the URL that returns {items: [{id, label}]} for a search. */
  lookup?: { table: string; url: string; module: boolean };
  /** Set by the server or an action — shown, never edited. */
  server: boolean;
}

export type Labels = Record<string, Record<string, string>>;
export type Row = Record<string, unknown>;
