import { canSeeField, type Actor } from "./access";
import { AUDIT_COLUMNS, picklistLabel, picklistValues, tableDef, TABLES } from "./catalog";
import { serverOwned } from "./engine";
import { tableConfig } from "./module-config";
import type { FieldMeta } from "./ui-types";

/** Field descriptions for a table, minus fields this actor can't see. */
export function fieldMetas(actor: Actor, table: string): FieldMeta[] {
  const server = serverOwned(table);
  const parent = tableConfig(table).parent?.field;
  return tableDef(table)
    .fields.filter((f) => f.column !== "workspace_id" && canSeeField(actor, table, f))
    .map((f) => {
      const meta: FieldMeta = {
        column: f.column,
        label: f.label,
        kind: f.kind,
        required: f.required,
        help: f.help,
        server: server.has(f.column) || AUDIT_COLUMNS.has(f.column) || f.column === parent,
      };
      if (f.maxLength) meta.maxLength = f.maxLength;
      if (f.scale !== undefined) meta.scale = f.scale;
      if (f.picklist) meta.options = picklistValues(f.picklist).map((v) => ({ value: v, label: picklistLabel(f.picklist!, v) }));
      if (f.lookup === "users") meta.lookup = { table: "users", url: "/api/v1/users", module: false };
      else if (f.lookup && TABLES[f.lookup]) meta.lookup = { table: f.lookup, url: `/api/v1/${TABLES[f.lookup].slug}?lookup=1`, module: true };
      return meta;
    });
}
