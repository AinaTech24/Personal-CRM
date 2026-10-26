import { MODULES, PERMISSIONS, PICKLISTS, TABLES, VALIDATION_RULES } from "./catalog.generated";
import type { CatalogTable, FieldDef, ModuleDef } from "./catalog-types";

export { MODULES, PERMISSIONS, PICKLISTS, TABLES, VALIDATION_RULES };
export type { CatalogTable, FieldDef, ModuleDef };

/** Fields every business module carries; all are server-managed (GV-02). */
export const AUDIT_COLUMNS = new Set([
  "id",
  "workspace_id",
  "created_at",
  "created_by_user_id",
  "updated_at",
  "updated_by_user_id",
  "row_version",
  "archived_at",
  "archived_by_user_id",
]);

const bySlug = new Map(Object.values(TABLES).map((t) => [t.slug, t]));
const moduleByTable = new Map(MODULES.map((m) => [m.table, m]));

export function tableBySlug(slug: string): CatalogTable | null {
  return bySlug.get(slug) ?? null;
}

export function tableDef(table: string): CatalogTable {
  const t = TABLES[table];
  if (!t) throw new Error(`Unknown table ${table}`);
  return t;
}

export function moduleDef(table: string): ModuleDef | null {
  return moduleByTable.get(table) ?? null;
}

export function fieldDef(table: string, column: string): FieldDef | null {
  return TABLES[table]?.fields.find((f) => f.column === column) ?? null;
}

export function hasColumn(table: string, column: string) {
  return !!fieldDef(table, column);
}

export function picklistValues(code: string): string[] {
  return (PICKLISTS[code] ?? []).map((o) => o.value);
}

export function picklistLabel(code: string, value: string) {
  return PICKLISTS[code]?.find((o) => o.value === value)?.label ?? value;
}

/** Phase-ordered modules for navigation. */
export const NAV_MODULES = [...MODULES].sort((a, b) => Number(a.no) - Number(b.no));
