export type FieldKind = "uuid" | "datetime" | "date" | "text" | "int" | "bigint" | "bool" | "json" | "string" | "char" | "decimal";

/** Data classification from the spec — drives redaction (see access.ts). */
export type Classification = "Internal" | "Confidential" | "Sensitive" | "Restricted";

export interface FieldDef {
  /** Spec column name (snake_case) — also the API/JSON key. */
  column: string;
  /** Prisma property name (camelCase). */
  prop: string;
  label: string;
  kind: FieldKind;
  maxLength?: number;
  precision?: number;
  scale?: number;
  /** Y = required at create, N = nullable, C = conditional (enforced by module rules). */
  required: "Y" | "N" | "C";
  picklist: string | null;
  /** Target table (spec name), or "users" for the CRM's User table. */
  lookup: string | null;
  rule: string;
  help: string;
  classification: Classification;
  indexed: boolean;
  default: string | null;
}

export interface CatalogTable {
  table: string;
  kind: "module" | "support";
  model: string;
  /** Prisma client delegate name, e.g. "ccLead". */
  delegate: string;
  dbTable: string;
  /** /api/v1/{slug} */
  slug: string;
  purpose?: string;
  fields: FieldDef[];
}

export interface ModuleDef {
  no: string;
  code: string;
  label: string;
  table: string;
  slug: string;
  purpose: string;
  phase: string;
  owner: string;
  scope: string;
  screen: string;
}

export interface PicklistOption {
  value: string;
  label: string;
}

export interface RuleDef {
  id: string;
  table: string;
  fields: string;
  rule: string;
  message: string;
}
