#!/usr/bin/env node
/**
 * Generates the MFD Consulting Command Centre catalog and Prisma models from
 * docs/mfd-command-centre/field-dictionary.json (the spec's field dictionary
 * workbook, converted by scripts/mfd/xlsx-to-json.py).
 *
 *   node scripts/mfd/generate.mjs
 *
 * Writes:
 *   - src/lib/mfd/catalog.generated.ts — every table, field, picklist and
 *     role permission the runtime engine validates against.
 *   - the block between the GENERATED markers at the end of
 *     prisma/schema.prisma.
 *
 * Deliberate departures from the spec's PostgreSQL design (decided with the
 * product owner: keep the existing MySQL + Prisma stack):
 *   - `users` is the CRM's existing User table, not a new one.
 *   - Foreign keys are plain indexed columns checked by the service layer
 *     (workspace + same-MFD rule GV-04), not Prisma relations — ~320 FKs as
 *     relations would bloat User with ~100 back-relations.
 *   - Picklists are varchar + API validation, as the spec itself prescribes.
 *   - Partial unique indexes (one active primary contact per MFD) are
 *     enforced transactionally, since MySQL has no partial indexes.
 *   - Two infrastructure tables the spec assumes from its stack are added:
 *     cc_sequences (server-issued reference numbers) and cc_file_blobs (the
 *     private object store behind file_objects.storage_key).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dict = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/mfd-command-centre/field-dictionary.json"), "utf8"));

const SINGULAR = {
  process_sop_register: "process_sop_register",
  training_attendance: "training_attendance",
  risks_dependencies: "risk_dependency",
  task_dependencies: "task_dependency",
  mfd_branches: "mfd_branch",
  notification_deliveries: "notification_delivery",
  sales_opportunities: "sales_opportunity",
};
const singular = (t) => SINGULAR[t] ?? (t.endsWith("ies") ? t.slice(0, -3) + "y" : t.replace(/s$/, ""));
const pascal = (s) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const modelOf = (table) => "Cc" + pascal(singular(table));
const delegateOf = (table) => "cc" + pascal(singular(table));

/** Spec type → { kind, ...size } */
function parseType(sql) {
  const t = sql.trim().toLowerCase();
  let m;
  if (t === "uuid") return { kind: "uuid" };
  if (t === "timestamptz") return { kind: "datetime" };
  if (t === "date") return { kind: "date" };
  if (t === "text") return { kind: "text" };
  if (t === "integer") return { kind: "int" };
  if (t === "bigint") return { kind: "bigint" };
  if (t === "boolean") return { kind: "bool" };
  if (t === "jsonb") return { kind: "json" };
  if ((m = t.match(/^varchar\((\d+)\)$/))) return { kind: "string", maxLength: +m[1] };
  if ((m = t.match(/^char\((\d+)\)$/))) return { kind: "char", maxLength: +m[1] };
  if ((m = t.match(/^numeric\((\d+),(\d+)\)$/))) return { kind: "decimal", precision: +m[1], scale: +m[2] };
  throw new Error(`Unknown SQL type: ${sql}`);
}

/** "Default false" / "Default new" / "default IN" in the rule or help text. */
function parseDefault(text) {
  const m = /\bdefault\s+([A-Za-z0-9_]+)/i.exec(text ?? "");
  return m ? m[1] : null;
}


// ---------- read spec ----------

const registry = dict["Module Registry"];
const uiApi = new Map(dict["UI API Contract"].map((r) => [r["Code"], r]));
const modules = registry.map((r) => {
  const api = uiApi.get(r["Code"]);
  const route = api ? api[Object.keys(api).find((k) => /list/i.test(k))] : "";
  const slug = (route.match(/\/api\/v1\/([a-z0-9-]+)/) ?? [])[1] ?? r["DB Table"].replace(/_/g, "-");
  return {
    no: r["No"],
    code: r["Code"],
    label: r["Module"],
    table: r["DB Table"],
    slug,
    purpose: r["Purpose"],
    phase: r["Phase"],
    owner: r["Business Owner"],
    scope: r["Data Scope"],
    screen: api?.["Primary UI Screen"] ?? "",
  };
});

// The dictionary's UI labels are mechanical ("Mfd Org Id"); make them read like a form.
const LABEL_OVERRIDES = { mfd_org_id: "MFD", mobile_e164: "Mobile", country_iso2: "Country", assigned_member_id: "Assigned to", auth_user_id: "Login user" };
const ACRONYMS = { Mfd: "MFD", Nda: "NDA", Arn: "ARN", Euin: "EUIN", Kpi: "KPI", Sop: "SOP", Url: "URL", Inr: "(INR)", Sla: "SLA", Ai: "AI", Tat: "TAT", Pct: "%", Ms: "(ms)", Sha256: "SHA-256", Ip: "IP", Id: "ID", Sip: "SIP", Aum: "AUM", Crm: "CRM", Mis: "MIS", Hr: "HR", It: "IT", Uat: "UAT", Gst: "GST", Pan: "PAN" };
function prettyLabel(column, raw) {
  if (LABEL_OVERRIDES[column]) return LABEL_OVERRIDES[column];
  let words = raw.split(/\s+/).filter(Boolean);
  if (words.length > 1 && /^id$/i.test(words.at(-1))) words.pop();
  if (words.length > 1 && /^(member|org)$/i.test(words.at(-1))) words.pop();
  words = words.map((w) => ACRONYMS[w] ?? w);
  return words.map((w, i) => (i === 0 || /^[A-Z0-9(%-]{2,}/.test(w) ? w : w.toLowerCase())).join(" ").replace("( ", "(");
}

const fieldRow = (table, r, support) => {
  const column = support ? r["Field"] : r["Field / Column"];
  const type = parseType(support ? r["SQL Type"] : r["SQL Data Type"]);
  const rule = support ? r["Validation / Description"] : r["Validation / Rule"];
  const help = support ? "" : r["Help / Meaning"];
  const lookup = (support ? r["FK Target"] : r["Lookup Target"]) || null;
  return {
    column,
    prop: camel(column),
    label: prettyLabel(column, support ? pascal(column).replace(/([a-z])([A-Z])/g, "$1 $2") : r["UI Label"]),
    ...type,
    required: r["Required"],
    picklist: r["Picklist"] || null,
    lookup,
    rule: rule || "",
    help: help || "",
    classification: support ? "Internal" : r["Classification"] || "Internal",
    indexed: support ? !!lookup : r["Indexed"] === "Y",
    default: parseDefault(rule) ?? parseDefault(help),
  };
};

const tables = {};
for (const m of modules) tables[m.table] = { table: m.table, kind: "module", fields: [] };
for (const r of dict["Field Dictionary"]) tables[r["Table"]].fields.push(fieldRow(r["Table"], r, false));
for (const r of dict["Support Field Dictionary"]) {
  const t = r["DB Table"];
  if (t === "users") continue; // the CRM's existing User table
  tables[t] ??= { table: t, kind: "support", fields: [] };
  tables[t].fields.push(fieldRow(t, r, true));
}
const supportPurpose = new Map(dict["Supporting Tables"].map((r) => [r["Physical Table"], r["Responsibility"]]));
for (const t of Object.values(tables)) {
  t.model = modelOf(t.table);
  t.delegate = delegateOf(t.table);
  t.dbTable = "cc_" + t.table;
  t.slug = modules.find((m) => m.table === t.table)?.slug ?? t.table.replace(/_/g, "-");
  if (t.kind === "support") t.purpose = supportPurpose.get(t.table) ?? "";
}

const picklists = {};
for (const r of dict["Picklists"]) {
  (picklists[r["Enum Code"]] ??= []).push({ value: r["Stored Value"], label: r["Display Label"], order: +r["Order"] });
}
for (const k of Object.keys(picklists)) picklists[k] = picklists[k].sort((a, b) => a.order - b.order).map(({ value, label }) => ({ value, label }));

const permissions = {};
for (const r of dict["Role Permissions"]) {
  const codes = r["CRUDAPE Codes"] === "-" ? "" : r["CRUDAPE Codes"];
  (permissions[r["Module Table"]] ??= {})[r["Role"]] = codes;
}

const rules = dict["Validation Rules"].map((r) => ({
  id: r["Rule ID"],
  table: r["Table / Scope"],
  fields: r["Fields"],
  rule: r["Rule / Invariant"],
  message: r["Error / Expected Response"],
}));

// sanity: every lookup target resolves
const known = new Set([...Object.keys(tables), "users"]);
for (const t of Object.values(tables)) for (const f of t.fields) if (f.lookup && !known.has(f.lookup)) throw new Error(`${t.table}.${f.column} -> unknown ${f.lookup}`);
for (const t of Object.values(tables)) for (const f of t.fields) if (f.picklist && !picklists[f.picklist]) throw new Error(`${t.table}.${f.column} unknown picklist ${f.picklist}`);

// ---------- catalog.generated.ts ----------

const catalogTs = `// GENERATED by scripts/mfd/generate.mjs from docs/mfd-command-centre/field-dictionary.json — do not edit by hand.
import type { CatalogTable, ModuleDef, PicklistOption, RuleDef } from "./catalog-types";

export const MODULES: ModuleDef[] = ${JSON.stringify(modules, null, 1)};

export const TABLES: Record<string, CatalogTable> = ${JSON.stringify(tables, null, 1)};

export const PICKLISTS: Record<string, PicklistOption[]> = ${JSON.stringify(picklists, null, 1)};

/** table -> role -> subset of "CRUAPE". */
export const PERMISSIONS: Record<string, Record<string, string>> = ${JSON.stringify(permissions, null, 1)};

export const VALIDATION_RULES: RuleDef[] = ${JSON.stringify(rules, null, 1)};
`;
fs.mkdirSync(path.join(ROOT, "src/lib/mfd"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "src/lib/mfd/catalog.generated.ts"), catalogTs);

// ---------- Prisma ----------

const UNIQUE = {
  mfd_organizations: [["workspace_id", "org_code"]],
  team_members: [["workspace_id", "work_email"], ["workspace_id", "auth_user_id"], ["workspace_id", "employee_code"]],
  assessment_templates: [["workspace_id", "template_code", "template_version"]],
  document_versions: [["document_id", "version_no"]],
  business_profiles: [["workspace_id", "mfd_org_id", "as_of_date", "profile_version"]],
  communications: [["workspace_id", "provider_name", "external_message_id"]],
  outbox_events: [["workspace_id", "idempotency_key"]],
  workspaces: [["slug"]],
  scoring_schemes: [["workspace_id", "scheme_code", "version"]],
  kpi_definitions: [["workspace_id", "metric_code", "version"]],
  assessment_questions: [["template_id", "question_key", "revision"]],
  task_dependencies: [["task_id", "depends_on_task_id"]],
  sop_versions: [["sop_id", "version_no"]],
};
const EXTRA_INDEX = {
  assessments: [["mfd_org_id", "status", "due_at"]],
  action_tasks: [["mfd_org_id", "status", "due_at"], ["assigned_member_id", "status", "due_at"]],
  consulting_sessions: [["mfd_org_id", "starts_at"]],
  business_profiles: [["mfd_org_id", "as_of_date", "profile_version"]],
  kpi_observations: [["mfd_org_id", "kpi_definition_id", "period_start", "revision_number"]],
  audit_events: [["workspace_id", "recorded_at"], ["entity_table", "entity_id"]],
  approval_audit_events: [["entity_type", "entity_id"]],
  client_access_grants: [["workspace_id", "mfd_org_id", "user_id"]],
  file_objects: [["workspace_id", "sha256"]],
  assessment_answers: [["assessment_id", "question_id", "submitted_at"]],
  outbox_events: [["state", "created_at"]],
};
// every server-issued reference number is unique per workspace
const NUMBER_FIELD = /^(lead_number|opportunity_no|engagement_code|assessment_number|finding_number|scorecard_number|session_number|task_number|project_number|training_number|decision_number|media_number|document_number|communication_number|review_number|improvement_number|risk_number|finance_number|ticket_number)$/;

function prismaField(t, f) {
  const p = f.prop;
  const map = p === f.column ? "" : ` @map("${f.column}")`;
  const nullable = f.required === "Y" ? "" : "?";
  const attrs = [];
  let type;
  switch (f.kind) {
    case "uuid":
      type = "String";
      if (f.column === "id") attrs.push("@id @default(uuid())");
      break;
    case "datetime":
      type = "DateTime";
      if (f.column === "created_at") attrs.push("@default(now())");
      if (f.column === "updated_at") attrs.push("@updatedAt");
      break;
    case "date":
      type = "DateTime";
      attrs.push("@db.Date");
      break;
    case "text":
      type = "String";
      attrs.push(/transcript|text_content|corrected_text|body_text|minutes|original_text/.test(f.column) ? "@db.MediumText" : "@db.Text");
      break;
    case "int":
      type = "Int";
      if (f.column === "row_version") attrs.push("@default(1)");
      else if (f.required === "Y" && /Default 0/i.test(f.rule)) attrs.push("@default(0)");
      break;
    case "bigint":
      type = "BigInt";
      break;
    case "bool":
      type = "Boolean";
      if (f.default === "true" || f.default === "false") attrs.push(`@default(${f.default})`);
      break;
    case "json":
      type = "Json";
      break;
    case "string":
      type = "String";
      attrs.push(`@db.VarChar(${f.maxLength})`);
      break;
    case "char":
      type = "String";
      attrs.push(`@db.Char(${f.maxLength})`);
      break;
    case "decimal":
      type = "Decimal";
      attrs.push(`@db.Decimal(${f.precision}, ${f.scale})`);
      break;
  }
  return `  ${p} ${type}${nullable}${attrs.length ? " " + attrs.join(" ") : ""}${map}`;
}

const indexable = (f) =>
  !["text", "json"].includes(f.kind) && !(f.kind === "string" && f.maxLength > 255) && f.column !== "id";

const models = [];
for (const t of Object.values(tables)) {
  const lines = [`/// ${t.kind === "module" ? modules.find((m) => m.table === t.table).label : t.purpose}`, `model ${t.model} {`];
  for (const f of t.fields) lines.push(prismaField(t, f));
  const cols = new Set(t.fields.map((f) => f.column));
  const keyOf = (c) => t.fields.find((f) => f.column === c).prop;
  const seen = new Set();
  const block = [];
  for (const u of [...(UNIQUE[t.table] ?? []), ...t.fields.filter((f) => NUMBER_FIELD.test(f.column)).map((f) => ["workspace_id", f.column])]) {
    if (!u.every((c) => cols.has(c))) throw new Error(`unique ${t.table}: ${u}`);
    const k = "u:" + u.join(",");
    if (seen.has(k)) continue;
    seen.add(k);
    block.push(`  @@unique([${u.map(keyOf).join(", ")}])`);
  }
  for (const ix of EXTRA_INDEX[t.table] ?? []) {
    if (!ix.every((c) => cols.has(c))) throw new Error(`index ${t.table}: ${ix}`);
    seen.add("i:" + ix.join(","));
    block.push(`  @@index([${ix.map(keyOf).join(", ")}])`);
  }
  for (const f of t.fields) {
    if (!f.indexed || !indexable(f)) continue;
    // already the leading column of a unique/index above?
    if ([...seen].some((k) => k.slice(2).split(",")[0] === f.column)) continue;
    seen.add("i:" + f.column);
    block.push(`  @@index([${f.prop}])`);
  }
  if (cols.has("workspace_id") && ![...seen].some((k) => k.slice(2).split(",")[0] === "workspace_id")) {
    block.push(`  @@index([workspaceId])`);
  }
  if (block.length) lines.push("", ...block);
  lines.push(`  @@map("${t.dbTable}")`, "}");
  models.push(lines.join("\n"));
}

models.push(`/// Server-issued reference numbers (LEAD-2026-000001 …), incremented atomically per workspace and key.
model CcSequence {
  workspaceId String   @map("workspace_id")
  key         String   @db.VarChar(60)
  value       Int      @default(0)
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@id([workspaceId, key])
  @@map("cc_sequences")
}

/// Private object store behind file_objects.storage_key — swap for S3 by
/// replacing src/lib/mfd/storage.ts; nothing else reads this table.
model CcFileBlob {
  storageKey String   @id @db.VarChar(191) @map("storage_key")
  data       Bytes    @db.LongBlob
  createdAt  DateTime @default(now()) @map("created_at")

  @@map("cc_file_blobs")
}`);

const BEGIN = "// >>> MFD COMMAND CENTRE — GENERATED by scripts/mfd/generate.mjs; do not edit by hand";
const END = "// <<< MFD COMMAND CENTRE";
const schemaPath = path.join(ROOT, "prisma/schema.prisma");
let schema = fs.readFileSync(schemaPath, "utf8");
const eol = schema.includes("\r\n") ? "\r\n" : "\n";
schema = schema.replace(/\r\n/g, "\n");
const start = schema.indexOf(BEGIN);
if (start !== -1) schema = schema.slice(0, start).trimEnd() + "\n";
schema = schema.trimEnd() + "\n\n" + [BEGIN, "", models.join("\n\n"), "", END].join("\n") + "\n";
fs.writeFileSync(schemaPath, schema.replace(/\n/g, eol));

console.log(`modules: ${modules.length}, tables: ${Object.keys(tables).length}, fields: ${Object.values(tables).reduce((n, t) => n + t.fields.length, 0)}, picklists: ${Object.keys(picklists).length}, rules: ${rules.length}`);
