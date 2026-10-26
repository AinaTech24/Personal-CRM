/**
 * The one write/read path for every Command Centre table, enforcing the
 * spec's global rules:
 *  GV-01 workspace-bound reads/writes      GV-02 server-owned audit fields
 *  GV-03 row_version optimistic locking    GV-04 same-workspace / same-MFD links
 *  GV-05 archive, never physical delete    GV-08 role + grant checks per access
 *  GV-09 explicit, logged state changes    GV-11 idempotent automation events
 * Module-specific invariants live in rules.ts.
 */
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { AUDIT_COLUMNS, fieldDef, tableDef } from "./catalog";
import type { FieldDef } from "./catalog-types";
import { can, canSeeField, canUseOrg, isWorkspaceWide, rowInScope, scopeWhere, type Action, type Actor } from "./access";
import { tableConfig } from "./module-config";
import { RULES, type OutboxSpec, type RuleCtx } from "./rules";
import { delegate, getRec, type Tx } from "./store";
import { FieldError, fromPrismaRow, normalizeInput, propOf, toPrismaData, type Rec } from "./values";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: string[]
  ) {
    super(message);
  }
}

const SUPPORT_SYSTEM_COLUMNS = new Set(["id", "workspace_id", "created_at"]);

/** Assignment-style member fields: suspended/departed members can't receive new work (TEAM-03). */
const NEW_WORK_FIELDS = new Set([
  "assigned_member_id",
  "owner_member_id",
  "lead_consultant_id",
  "assigned_consultant_id",
  "organizer_member_id",
  "trainer_member_id",
  "lead_member_id",
  "prepared_by_member_id",
  "aina_owner_member_id",
  "account_owner_id",
  "member_id",
]);

export interface WriteOptions {
  /** Automations: bypass permission/action-only checks; may set server fields. */
  system?: boolean;
  /** Server fields the caller (an action) is allowed to set. */
  allow?: string[];
  /** Internal writes whose references the caller already validated: skip the per-reference lookups. */
  trusted?: boolean;
}

function cols(table: string) {
  return new Set(tableDef(table).fields.map((f) => f.column));
}

function isModule(table: string) {
  return tableDef(table).kind === "module";
}

export function serverOwned(table: string): Set<string> {
  const c = tableConfig(table);
  const s = new Set<string>(isModule(table) ? AUDIT_COLUMNS : SUPPORT_SYSTEM_COLUMNS);
  for (const f of c.serverFields ?? []) s.add(f);
  if (c.numbering) s.add(c.numbering.field);
  return s;
}

export function need(actor: Actor, table: string, action: Action, opts?: WriteOptions) {
  if (opts?.system) return;
  if (!can(actor, table, action)) {
    const verb = { C: "create", R: "view", U: "edit", A: "archive", P: "approve", E: "export" }[action];
    throw new HttpError(403, `You don't have permission to ${verb} ${tableDef(table).table.replace(/_/g, " ")}.`);
  }
}

/** Visible-field redaction for output (spec field classification). */
export function redact(actor: Actor, table: string, rec: Rec): Rec {
  const hidden: string[] = [];
  const out: Rec = { ...rec };
  for (const f of tableDef(table).fields) {
    if (f.column in out && !canSeeField(actor, table, f)) {
      out[f.column] = null;
      hidden.push(f.column);
    }
  }
  if (hidden.length) out._redacted = hidden;
  return out;
}

function parentOf(table: string) {
  return tableConfig(table).parent ?? null;
}

/** Throws unless the actor may see the row (including via its parent, for parent-scoped support rows). */
export async function assertRowAccess(actor: Actor, table: string, rec: Rec, client: typeof db | Tx = db) {
  if (!rowInScope(actor, table, rec)) throw new HttpError(404, "Not found");
  const parent = parentOf(table);
  if (parent && !("mfd_org_id" in rec) && !isWorkspaceWide(actor, table)) {
    const p = await getRec(client, parent.table, rec[parent.field] as string, actor.workspaceId);
    if (!p) throw new HttpError(404, "Not found");
    await assertRowAccess(actor, parent.table, p, client);
  }
}

// ---------------------------------------------------------------- reads

export interface ListParams {
  filters: Record<string, string>;
  q?: string;
  archived?: "exclude" | "include" | "only";
  sort?: string;
  dir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export function parseListParams(table: string, sp: URLSearchParams): ListParams {
  const columns = cols(table);
  const filters: Record<string, string> = {};
  for (const [k, v] of sp.entries()) if (columns.has(k) && v !== "") filters[k] = v;
  const archived = sp.get("archived");
  return {
    filters,
    q: sp.get("q")?.trim() || undefined,
    archived: archived === "include" || archived === "only" ? archived : "exclude",
    sort: sp.get("sort") ?? undefined,
    dir: sp.get("dir") === "asc" ? "asc" : sp.get("dir") === "desc" ? "desc" : undefined,
    limit: Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 200),
    offset: Math.max(Number(sp.get("offset")) || 0, 0),
  };
}

function filterValue(f: FieldDef, v: string): unknown {
  if (v === "null") return null;
  switch (f.kind) {
    case "bool":
      return v === "true";
    case "int":
      return Number(v);
    case "date":
      return new Date(`${v}T00:00:00.000Z`);
    default:
      return v;
  }
}

async function listWhere(actor: Actor, table: string, p: ListParams): Promise<Record<string, unknown>> {
  const columns = cols(table);
  const where: Record<string, unknown> = { ...scopeWhere(actor, table, columns) };
  const and: Record<string, unknown>[] = [];

  const parent = parentOf(table);
  if (parent && !columns.has("mfd_org_id") && !isWorkspaceWide(actor, table)) {
    const pid = p.filters[parent.field];
    if (!pid) throw new HttpError(400, `Filter by ${parent.field} is required.`);
    const prow = await getRec(db, parent.table, pid, actor.workspaceId);
    if (!prow) throw new HttpError(404, "Not found");
    await assertRowAccess(actor, parent.table, prow);
  }

  for (const [k, v] of Object.entries(p.filters)) {
    const f = fieldDef(table, k)!;
    if (["text", "json"].includes(f.kind)) continue;
    and.push({ [f.prop]: filterValue(f, v) });
  }
  if (columns.has("archived_at")) {
    if (p.archived === "exclude") and.push({ archivedAt: null });
    if (p.archived === "only") and.push({ archivedAt: { not: null } });
  }
  const search = tableConfig(table).searchFields;
  if (p.q && search.length) {
    and.push({ OR: search.filter((c) => columns.has(c)).map((c) => ({ [propOf(table, c)]: { contains: p.q } })) });
  }
  if (and.length) where.AND = and;
  return where;
}

function orderBy(table: string, p: ListParams) {
  const columns = cols(table);
  const cfg = tableConfig(table);
  if (p.sort && columns.has(p.sort)) return [{ [propOf(table, p.sort)]: p.dir ?? "asc" }, { id: "asc" }];
  if (cfg.defaultSort && columns.has(cfg.defaultSort.field)) {
    return [{ [propOf(table, cfg.defaultSort.field)]: cfg.defaultSort.dir }, { id: "asc" }];
  }
  return [{ [columns.has("updated_at") ? "updatedAt" : "createdAt"]: "desc" }, { id: "asc" }];
}

export async function listRecords(actor: Actor, table: string, p: ListParams) {
  need(actor, table, "R");
  const where = await listWhere(actor, table, p);
  const d = delegate(db, table);
  const [rows, total] = await Promise.all([
    d.findMany({ where, orderBy: orderBy(table, p), take: p.limit, skip: p.offset }),
    d.count({ where }),
  ]);
  return { rows: rows.map((r) => redact(actor, table, fromPrismaRow(table, r))), total };
}

export async function getRecord(actor: Actor, table: string, id: string) {
  need(actor, table, "R");
  const rec = await getRec(db, table, id, actor.workspaceId);
  if (!rec) throw new HttpError(404, "Not found");
  await assertRowAccess(actor, table, rec);
  return redact(actor, table, rec);
}

/** id + display label, for reference pickers. Any consulting role may look up team members (names only). */
export async function lookupRecords(actor: Actor, table: string, q: string | undefined, filters: Record<string, string>) {
  const cfg = tableConfig(table);
  const teamDirectory = table === "team_members" && actor.roles.size > 0;
  if (!teamDirectory) need(actor, table, "R");
  const p: ListParams = { filters, q, archived: "exclude", limit: 25, offset: 0 };
  const where = teamDirectory ? { workspaceId: actor.workspaceId, archivedAt: null, ...(q ? { fullName: { contains: q } } : {}) } : await listWhere(actor, table, p);
  const rows = await delegate(db, table).findMany({ where, orderBy: orderBy(table, p), take: 25 });
  return rows.map((r) => {
    const rec = fromPrismaRow(table, r);
    const number = cfg.numbering ? (rec[cfg.numbering.field] as string) : null;
    const label = String(rec[cfg.labelField] ?? rec.id);
    return {
      id: rec.id as string,
      label: number && number !== label ? `${number} · ${label}` : label,
      mfd_org_id: (rec.mfd_org_id as string | null | undefined) ?? null,
      status: cfg.statusField ? (rec[cfg.statusField] as string) : null,
    };
  });
}

// ---------------------------------------------------------------- writes

function typedDefault(f: FieldDef): unknown {
  if (!f.default) return undefined;
  if (f.kind === "bool") return f.default === "true";
  if (f.kind === "int") return Number(f.default);
  return f.default;
}

function readInput(actor: Actor, table: string, input: Rec, op: "create" | "update", opts?: WriteOptions): Rec {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Expected a JSON object.");
  const server = serverOwned(table);
  const allow = new Set(opts?.allow ?? []);
  const out: Rec = {};
  const errors: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (k === "row_version" || k.startsWith("_")) continue;
    const f = fieldDef(table, k);
    if (!f) {
      errors.push(`Unknown field "${k}".`);
      continue;
    }
    if (server.has(k) && !opts?.system && !allow.has(k)) {
      errors.push(`${f.label} is set by the system.`);
      continue;
    }
    if (!opts?.system && !canSeeField(actor, table, f)) throw new HttpError(403, `You can't set ${f.label}.`);
    try {
      const nv = normalizeInput(table, f, v);
      if (nv !== undefined) out[k] = nv;
    } catch (e) {
      if (e instanceof FieldError) errors.push(e.message);
      else throw e;
    }
  }
  if (op === "update" && "mfd_org_id" in out && table !== "leads") errors.push("GV-04: A record can't be moved to another MFD.");
  if (errors.length) throw new HttpError(422, errors[0], errors);
  return out;
}

async function checkLookups(actor: Actor, tx: Tx, table: string, next: Rec, prev: Rec | null, opts?: WriteOptions) {
  const errors: string[] = [];
  for (const f of tableDef(table).fields) {
    if (!f.lookup || AUDIT_COLUMNS.has(f.column) || f.column === "workspace_id") continue;
    const v = next[f.column] as string | null | undefined;
    if (!v || (prev && prev[f.column] === v)) continue;
    if (f.lookup === "users") {
      const u = await tx.user.findUnique({ where: { id: v }, select: { isActive: true } });
      if (!u?.isActive) errors.push(`${f.label}: user not found or inactive.`);
      continue;
    }
    const target = await getRec(tx, f.lookup, v, actor.workspaceId);
    if (!target) {
      errors.push(`${f.label}: referenced record not found.`);
      continue;
    }
    if (f.lookup === "mfd_organizations") {
      if (!opts?.system && !canUseOrg(actor, v)) throw new HttpError(403, "You don't have access to that MFD.");
      if (f.column !== "mfd_org_id" && next.mfd_org_id && next.mfd_org_id !== v) errors.push(`GV-04: ${f.label} must be this record's MFD.`);
    } else if ("mfd_org_id" in target && target.mfd_org_id && "mfd_org_id" in next && next.mfd_org_id && target.mfd_org_id !== next.mfd_org_id) {
      errors.push(`GV-04: ${f.label} belongs to another organization.`);
    }
    if ("archived_at" in target && target.archived_at) errors.push(`${f.label}: that record is archived.`);
    if (f.lookup === "team_members" && NEW_WORK_FIELDS.has(f.column)) {
      if (!target.is_available_for_assignment || target.status !== "active") errors.push(`TEAM-03: ${target.full_name as string} can't take new work right now.`);
    }
  }
  return errors;
}

async function nextNumber(tx: Tx, workspaceId: string, prefix: string, yearly: boolean) {
  const year = new Date().getUTCFullYear();
  const key = yearly ? `${prefix}-${year}` : prefix;
  const id = { workspaceId_key: { workspaceId, key } };
  await tx.ccSequence.upsert({ where: id, create: { workspaceId, key, value: 0 }, update: {} });
  const s = await tx.ccSequence.update({ where: id, data: { value: { increment: 1 } } });
  const n = String(s.value).padStart(6, "0");
  return yearly ? `${prefix}-${year}-${n}` : `${prefix}-${n}`;
}

export async function writeAudit(tx: Tx, actor: Actor, table: string, id: string, action: string, prev: Rec | null, next: Rec | null) {
  let changed: Record<string, unknown> | null = null;
  if (next) {
    changed = {};
    for (const f of tableDef(table).fields) {
      if (["updated_at", "row_version"].includes(f.column)) continue;
      const a = prev?.[f.column] ?? null;
      const b = next[f.column] ?? null;
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      // Values of classified fields stay out of the trail; the change itself is recorded.
      changed[f.column] = f.classification === "Internal" ? { from: a, to: b } : { changed: true };
    }
  }
  await tx.ccAuditEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      userId: actor.userId,
      entityTable: table,
      entityId: id,
      action,
      changedColumns: (changed ?? undefined) as object | undefined,
      recordedAt: new Date(),
    },
  });
}

async function writeStateChange(tx: Tx, actor: Actor, table: string, id: string, prev: Rec | null, next: Rec) {
  const sf = tableConfig(table).statusField;
  if (!sf || (prev && prev[sf] === next[sf]) || !next[sf]) return;
  await tx.ccApprovalAuditEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      entityType: table,
      entityId: id,
      actorUserId: actor.userId,
      oldState: (prev?.[sf] as string | null) ?? null,
      newState: next[sf] as string,
      eventAt: new Date(),
    },
  });
}

async function writeOutbox(tx: Tx, actor: Actor, events: OutboxSpec[]) {
  for (const e of events) {
    const exists = await tx.ccOutboxEvent.findFirst({ where: { workspaceId: actor.workspaceId, idempotencyKey: e.key }, select: { id: true } });
    if (exists) continue;
    await tx.ccOutboxEvent.create({
      data: {
        workspaceId: actor.workspaceId,
        eventType: e.type,
        aggregateId: e.aggregateId,
        payloadJson: { ...(e.payload ?? {}), actorUserId: actor.userId } as object,
        state: "pending",
        retryCount: 0,
        idempotencyKey: e.key,
      },
    });
  }
}

export function kickAutomations() {
  void import("./automations").then((m) => m.processOutboxSoon()).catch(() => {});
}

function requiredErrors(table: string, rec: Rec) {
  const server = serverOwned(table);
  const errors: string[] = [];
  for (const f of tableDef(table).fields) {
    if (f.required !== "Y" || server.has(f.column)) continue;
    const v = rec[f.column];
    if (v === null || v === undefined || v === "") errors.push(`${f.label} is required.`);
  }
  return errors;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (attempt < 2 && (code === "P2034" || (code === "P2002" && String((e as { meta?: { modelName?: string } }).meta?.modelName ?? "").includes("CcSequence")))) continue;
      throw e;
    }
  }
}

function enteringApproval(table: string, prev: Rec | null, next: Rec) {
  const cfg = tableConfig(table);
  if (!cfg.statusField) return null;
  const v = next[cfg.statusField] as string | null;
  if (!v || prev?.[cfg.statusField] === v) return null;
  return { value: v, approval: (cfg.approvalStatuses ?? []).includes(v), actionOnly: (cfg.actionOnlyStatuses ?? []).includes(v) };
}

/** Create inside an existing transaction; returns the saved, unredacted record. */
export async function createIn(tx: Tx, actor: Actor, table: string, input: Rec, opts?: WriteOptions): Promise<Rec> {
  const def = tableDef(table);
  const cfg = tableConfig(table);
  if ((cfg.mode ?? "editable") === "read-only" && !opts?.system) throw new HttpError(405, "These records are written by the system.");
  need(actor, table, "C", opts);
  const data = readInput(actor, table, input, "create", opts);
  const columns = cols(table);
  const next: Rec = {};
  for (const f of def.fields) {
    if (f.column in data) next[f.column] = data[f.column];
    else if (typedDefault(f) !== undefined) next[f.column] = typedDefault(f);
  }
  const id = randomUUID();
  next.id = id;
  if (columns.has("workspace_id")) next.workspace_id = actor.workspaceId;
  if (columns.has("created_by_user_id")) next.created_by_user_id = actor.userId;
  if (columns.has("updated_by_user_id")) next.updated_by_user_id = actor.userId;
  if (columns.has("row_version")) next.row_version = 1;
  if (columns.has("created_at")) next.created_at = new Date().toISOString();

  if (columns.has("mfd_org_id") && next.mfd_org_id && !opts?.system && !canUseOrg(actor, next.mfd_org_id as string)) {
    throw new HttpError(403, "You don't have access to that MFD.");
  }
  const parent = cfg.parent;
  if (parent && !opts?.system) {
    const p = await getRec(tx, parent.table, next[parent.field] as string, actor.workspaceId);
    if (!p) throw new HttpError(422, `${parent.field}: parent record not found.`);
    await assertRowAccess(actor, parent.table, p, tx);
    if (!can(actor, parent.table === "assessment_answers" ? "assessments" : parent.table, "U")) {
      throw new HttpError(403, "You can't change that record.");
    }
  }

  const transition = enteringApproval(table, null, next);
  if (transition?.actionOnly && !opts?.system && !(opts?.allow ?? []).includes(cfg.statusField!)) {
    throw new HttpError(422, `New records can't start as "${transition.value}".`);
  }
  if (transition?.approval) need(actor, table, "P", opts);

  const ctx: RuleCtx = { actor, tx, table, op: "create", prev: null, next };
  const rules = RULES[table];
  await rules?.prepare?.(ctx);
  const errors = [...requiredErrors(table, next), ...(opts?.trusted ? [] : await checkLookups(actor, tx, table, next, null, opts)), ...((await rules?.validate?.(ctx)) ?? [])];
  if (errors.length) throw new HttpError(422, errors[0], errors);

  if (cfg.numbering) next[cfg.numbering.field] = await nextNumber(tx, actor.workspaceId, cfg.numbering.prefix, cfg.numbering.yearly);

  const row = await delegate(tx, table).create({ data: toPrismaData(table, next) });
  const saved = fromPrismaRow(table, row);
  await writeAudit(tx, actor, table, id, "create", null, saved);
  await writeStateChange(tx, actor, table, id, null, saved);
  await rules?.afterWrite?.({ ...ctx, next: saved, id });
  await writeOutbox(tx, actor, rules?.events?.({ ...ctx, next: saved, id }) ?? []);
  return saved;
}

export async function createRecord(actor: Actor, table: string, input: Rec, opts?: WriteOptions): Promise<Rec> {
  const result = await withRetry(() => db.$transaction((tx) => createIn(tx, actor, table, input, opts)));
  kickAutomations();
  return redact(actor, table, result);
}

export async function updateRecord(actor: Actor, table: string, id: string, input: Rec, opts?: WriteOptions): Promise<Rec> {
  const result = await withRetry(() => db.$transaction((tx) => updateIn(tx, actor, table, id, input, opts)));
  kickAutomations();
  return redact(actor, table, result);
}

/** Update inside an existing transaction; returns the saved, unredacted record. */
export async function updateIn(tx: Tx, actor: Actor, table: string, id: string, input: Rec, opts?: WriteOptions): Promise<Rec> {
  const cfg = tableConfig(table);
  const mode = cfg.mode ?? "editable";
  if (mode !== "editable" && !opts?.system) throw new HttpError(405, mode === "read-only" ? "These records are written by the system." : "These records can't be changed once added.");
  need(actor, table, "U", opts);
  const columns = cols(table);
  const expected = input.row_version;
  if (columns.has("row_version") && !opts?.system && (typeof expected !== "number" || !Number.isInteger(expected))) {
    throw new HttpError(428, "row_version is required to update (GV-03).");
  }
  const data = readInput(actor, table, input, "update", opts);
  const prev = await getRec(tx, table, id, actor.workspaceId);
  if (!prev) throw new HttpError(404, "Not found");
  if (!opts?.system) await assertRowAccess(actor, table, prev, tx);
  if (prev.archived_at && !opts?.system) throw new HttpError(409, "This record is archived — restore it first.");
  if (columns.has("row_version") && typeof expected === "number" && prev.row_version !== expected) {
    throw new HttpError(409, "This record was updated by another user. Reload and try again.");
  }

  const next: Rec = { ...prev, ...data };
  if (columns.has("updated_by_user_id")) next.updated_by_user_id = actor.userId;
  if (columns.has("updated_at")) next.updated_at = new Date().toISOString();

  const transition = enteringApproval(table, prev, next);
  if (transition?.actionOnly && !opts?.system && !(opts?.allow ?? []).includes(cfg.statusField!)) {
    throw new HttpError(422, `Use the dedicated action to move this record to "${transition.value}".`);
  }
  if (transition?.approval) need(actor, table, "P", opts);

  const ctx: RuleCtx = { actor, tx, table, op: "update", prev, next };
  const rules = RULES[table];
  await rules?.prepare?.(ctx);
  const errors = [...requiredErrors(table, next), ...(opts?.trusted ? [] : await checkLookups(actor, tx, table, next, prev, opts)), ...((await rules?.validate?.(ctx)) ?? [])];
  if (errors.length) throw new HttpError(422, errors[0], errors);

  const changes: Rec = {};
  for (const f of tableDef(table).fields) {
    if (["id", "workspace_id", "created_at", "created_by_user_id", "row_version", "updated_at"].includes(f.column)) continue;
    if (JSON.stringify(prev[f.column] ?? null) !== JSON.stringify(next[f.column] ?? null)) changes[f.column] = next[f.column];
  }
  if (columns.has("updated_by_user_id")) changes.updated_by_user_id = actor.userId;
  const where: Record<string, unknown> = { id };
  if (columns.has("workspace_id")) where.workspaceId = actor.workspaceId;
  if (columns.has("row_version")) where.rowVersion = prev.row_version;
  const data2: Record<string, unknown> = toPrismaData(table, changes);
  if (columns.has("row_version")) data2.rowVersion = { increment: 1 };
  const res = await delegate(tx, table).updateMany({ where, data: data2 });
  if (res.count === 0) throw new HttpError(409, "This record was updated by another user. Reload and try again.");

  const saved = (await getRec(tx, table, id, actor.workspaceId))!;
  await writeAudit(tx, actor, table, id, "update", prev, saved);
  await writeStateChange(tx, actor, table, id, prev, saved);
  await rules?.afterWrite?.({ ...ctx, next: saved, id });
  await writeOutbox(tx, actor, rules?.events?.({ ...ctx, next: saved, id }) ?? []);
  return saved;
}

/** Soft archive / restore (spec: DELETE is never exposed for business records). */
export async function setArchived(actor: Actor, table: string, id: string, archive: boolean, rowVersion?: number): Promise<Rec> {
  if (!cols(table).has("archived_at")) throw new HttpError(405, "These records can't be archived.");
  need(actor, table, "A");
  const result = await db.$transaction(async (tx) => {
    const prev = await getRec(tx, table, id, actor.workspaceId);
    if (!prev) throw new HttpError(404, "Not found");
    await assertRowAccess(actor, table, prev, tx);
    if (typeof rowVersion === "number" && prev.row_version !== rowVersion) throw new HttpError(409, "This record was updated by another user. Reload and try again.");
    const res = await delegate(tx, table).updateMany({
      where: { id, workspaceId: actor.workspaceId, rowVersion: prev.row_version },
      data: {
        archivedAt: archive ? new Date() : null,
        archivedByUserId: archive ? actor.userId : null,
        updatedByUserId: actor.userId,
        rowVersion: { increment: 1 },
      },
    });
    if (res.count === 0) throw new HttpError(409, "This record was updated by another user. Reload and try again.");
    const saved = (await getRec(tx, table, id, actor.workspaceId))!;
    await writeAudit(tx, actor, table, id, archive ? "archive" : "restore", prev, saved);
    return saved;
  });
  return redact(actor, table, result);
}

/** Physical removal, only for pure link rows (attendee, dependency, document link, participant). */
export async function deleteLink(actor: Actor, table: string, id: string) {
  const cfg = tableConfig(table);
  if (!cfg.deletable || !cfg.parent) throw new HttpError(405, "These records can't be deleted.");
  await db.$transaction(async (tx) => {
    const rec = await getRec(tx, table, id, actor.workspaceId);
    if (!rec) throw new HttpError(404, "Not found");
    await assertRowAccess(actor, table, rec, tx);
    if (!can(actor, cfg.parent!.table, "U")) throw new HttpError(403, "You can't change that record.");
    await delegate(tx, table).delete({ where: { id } });
    await tx.ccAuditEvent.create({
      data: { workspaceId: actor.workspaceId, userId: actor.userId, entityTable: table, entityId: id, action: "delete", recordedAt: new Date() },
    });
  });
}

export async function exportCsv(actor: Actor, table: string, p: ListParams): Promise<string> {
  need(actor, table, "E");
  const where = await listWhere(actor, table, p);
  const rows = await delegate(db, table).findMany({ where, orderBy: orderBy(table, p), take: 5000 });
  const fields = tableDef(table).fields.filter((f) => canSeeField(actor, table, f));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Defuse spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [fields.map((f) => f.column).join(",")];
  for (const r of rows) {
    const rec = fromPrismaRow(table, r);
    lines.push(fields.map((f) => esc(rec[f.column])).join(","));
  }
  await db.ccAuditEvent.create({
    data: { workspaceId: actor.workspaceId, userId: actor.userId, entityTable: table, entityId: "export", action: "export", recordedAt: new Date() },
  });
  return lines.join("\r\n");
}

/**
 * Display labels for the reference columns of some rows: {column: {id: label}}.
 * Only for targets the actor can read (team names and user names are always
 * shown); anything else stays unresolved rather than leaking a label.
 */
export async function resolveLabels(actor: Actor, table: string, rows: Rec[]): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  const byTarget = new Map<string, Set<string>>();
  const fields = tableDef(table).fields.filter((f) => f.lookup && f.column !== "workspace_id");
  for (const f of fields) {
    for (const r of rows) {
      const v = r[f.column];
      if (typeof v === "string" && v) {
        if (!byTarget.has(f.lookup!)) byTarget.set(f.lookup!, new Set());
        byTarget.get(f.lookup!)!.add(v);
      }
    }
  }
  const labels = new Map<string, Map<string, string>>();
  for (const [target, ids] of byTarget) {
    const m = new Map<string, string>();
    labels.set(target, m);
    if (target === "users") {
      const users = await db.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, surname: true } });
      for (const u of users) m.set(u.id, [u.name, u.surname].filter(Boolean).join(" "));
      continue;
    }
    if (target !== "team_members" && !can(actor, target, "R")) continue;
    const cfg = tableConfig(target);
    const found = await delegate(db, target).findMany({ where: { id: { in: [...ids] }, workspaceId: actor.workspaceId } });
    for (const row of found) {
      const rec = fromPrismaRow(target, row);
      if (target !== "team_members" && !rowInScope(actor, target, rec)) continue;
      const number = cfg.numbering ? (rec[cfg.numbering.field] as string) : null;
      const label = String(rec[cfg.labelField] ?? rec.id);
      m.set(rec.id as string, number && number !== label ? `${number} · ${label}` : label);
    }
  }
  for (const f of fields) {
    const m = labels.get(f.lookup!);
    if (!m) continue;
    const col: Record<string, string> = {};
    for (const r of rows) {
      const v = r[f.column];
      if (typeof v === "string" && m.has(v)) col[v] = m.get(v)!;
    }
    out[f.column] = col;
  }
  return out;
}
