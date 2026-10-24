import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ActionBar } from "@/components/consulting/action-bar";
import { AssessmentConsole } from "@/components/consulting/assessment-console";
import { ChildAdd, DownloadButton, EditableRecord, RemoveLinkButton } from "@/components/consulting/detail-client";
import { actionsFor } from "@/components/consulting/module-actions";
import { db } from "@/lib/db";
import { can, codesFor, type Actor } from "@/lib/mfd/access";
import { getActor } from "@/lib/mfd/actor";
import { AUDIT_COLUMNS, moduleDef, NAV_MODULES, TABLES } from "@/lib/mfd/catalog";
import { getRecord, HttpError, listRecords, resolveLabels } from "@/lib/mfd/engine";
import { formatValue, humanize, statusTone } from "@/lib/mfd/format";
import { CHILD_TABLES, tableConfig } from "@/lib/mfd/module-config";
import { loadAnswerSheet } from "@/lib/mfd/answer-sheet";
import { getRec } from "@/lib/mfd/store";
import { fieldMetas } from "@/lib/mfd/ui-meta";
import type { FieldMeta, Labels, Row } from "@/lib/mfd/ui-types";

function FieldGrid({ fields, record, labels }: { fields: FieldMeta[]; record: Row; labels: Labels }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((f) => {
        const v = record[f.column];
        const wide = f.kind === "text" || f.kind === "json";
        const target = f.lookup?.module && typeof v === "string" ? `/consulting/${f.lookup.table}/${v}` : null;
        const text = formatValue(f, v, labels);
        return (
          <div key={f.column} className={wide ? "sm:col-span-2 xl:col-span-3" : undefined}>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{f.label}</dt>
            <dd className={wide ? "mt-0.5 whitespace-pre-wrap break-words text-sm" : "mt-0.5 truncate text-sm"}>
              {target && text !== "—" ? (
                <Link href={target} className="text-primary hover:underline">
                  {text}
                </Link>
              ) : (
                text
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

async function RecordTable({ actor, table, rows, removable }: { actor: Actor; table: string; rows: Row[]; removable?: boolean }) {
  const cfg = tableConfig(table);
  const metas = fieldMetas(actor, table);
  const byCol = new Map(metas.map((m) => [m.column, m]));
  const cols = cfg.listColumns.filter((c) => byCol.has(c)).map((c) => byCol.get(c)!);
  const labels = await resolveLabels(actor, table, rows);
  const linkable = !!moduleDef(table) || !cfg.parent;
  if (!rows.length) return <p className="text-sm text-muted-foreground">None yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            {cols.map((c) => (
              <th key={c.column} className="whitespace-nowrap px-3 py-2 font-medium">
                {c.label}
              </th>
            ))}
            {removable && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id as string} className="border-t border-border">
              {cols.map((c, i) => {
                const text = formatValue(c, r[c.column], labels);
                return (
                  <td key={c.column} className="max-w-[280px] truncate px-3 py-2">
                    {i === 0 && linkable ? (
                      <Link href={`/consulting/${table}/${r.id as string}`} className="text-primary hover:underline">
                        {text === "—" ? "Open" : text}
                      </Link>
                    ) : c.column === cfg.statusField && r[c.column] ? (
                      <Badge variant={statusTone(r[c.column])}>{text}</Badge>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
              {removable && (
                <td className="px-3 py-2 text-right">
                  <RemoveLinkButton slug={TABLES[table].slug} id={r.id as string} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** MFD 360 (AT-07): everything recorded against one MFD, newest first, per module. */
async function Mfd360({ actor, orgId }: { actor: Actor; orgId: string }) {
  const modules = NAV_MODULES.filter((m) => m.table !== "mfd_organizations" && TABLES[m.table].fields.some((f) => f.column === "mfd_org_id") && can(actor, m.table, "R"));
  const results = await Promise.all(
    modules.map(async (m) => {
      const r = await listRecords(actor, m.table, { filters: { mfd_org_id: orgId }, archived: "exclude", limit: 4, offset: 0 }).catch(() => null);
      return { m, r };
    })
  );
  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {await Promise.all(
        results
          .filter((x) => x.r)
          .map(async ({ m, r }) => {
            const cfg = tableConfig(m.table);
            const metas = fieldMetas(actor, m.table);
            const statusMeta = cfg.statusField ? metas.find((x) => x.column === cfg.statusField) : undefined;
            const labels = await resolveLabels(actor, m.table, r!.rows);
            return (
              <div key={m.table} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/consulting/${m.table}?mfd_org_id=${orgId}`} className="text-sm font-medium hover:underline">
                    {m.label}
                  </Link>
                  <span className="text-xs text-muted-foreground">{r!.total}</span>
                </div>
                {r!.rows.length === 0 ? (
                  <Link href={`/consulting/${m.table}/new?mfd_org_id=${orgId}`} className="text-xs text-muted-foreground hover:underline">
                    + Add
                  </Link>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {r!.rows.map((row) => {
                      const number = cfg.numbering ? (row[cfg.numbering.field] as string) : null;
                      const labelMeta = metas.find((x) => x.column === cfg.labelField);
                      const label = labelMeta ? formatValue(labelMeta, row[cfg.labelField], labels) : String(row.id);
                      return (
                        <li key={row.id as string} className="flex items-center justify-between gap-2 text-xs">
                          <Link href={`/consulting/${m.table}/${row.id as string}`} className="truncate text-primary hover:underline">
                            {number && number !== label ? `${number} · ${label}` : label}
                          </Link>
                          {statusMeta && row[statusMeta.column] ? (
                            <Badge variant={statusTone(row[statusMeta.column])} className="shrink-0">
                              {formatValue(statusMeta, row[statusMeta.column])}
                            </Badge>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })
      )}
    </div>
  );
}

async function AssessmentPanel({ actor, rec }: { actor: Actor; rec: Row }) {
  const { questions, answers } = await loadAnswerSheet(rec);
  const canAnswer = can(actor, "assessments", "U") && ["issued", "in_progress", "reopened"].includes(rec.status as string) && !rec.archived_at;
  if (!questions.length) return <p className="text-sm text-muted-foreground">The template has no questions.</p>;
  return <AssessmentConsole assessmentId={rec.id as string} canAnswer={canAnswer} questions={questions} answers={answers} />;
}

async function FilePanel({ actor, fileId }: { actor: Actor; fileId: string | null }) {
  if (!fileId) return <p className="text-sm text-muted-foreground">No file uploaded yet.</p>;
  const f = await getRec(db, "file_objects", fileId, actor.workspaceId);
  if (!f) return <p className="text-sm text-muted-foreground">File not found.</p>;
  const size = Number(f.size_bytes);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{f.original_filename as string}</p>
        <p className="text-xs text-muted-foreground">
          {f.mime_type as string} · {size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`} · scan{" "}
          <Badge variant={statusTone(f.scan_status)}>{f.scan_status as string}</Badge> · SHA-256 {String(f.sha256).slice(0, 12)}…
        </p>
      </div>
      {f.scan_status === "clean" && (
        <div className="flex gap-2">
          <DownloadButton fileId={fileId} label="View" inline />
          <DownloadButton fileId={fileId} />
        </div>
      )}
    </div>
  );
}

async function History({ actor, table, id }: { actor: Actor; table: string; id: string }) {
  if (!can(actor, "approval_audit_events", "R") && !can(actor, "audit_events", "R")) return null;
  const [states, edits] = await Promise.all([
    can(actor, "approval_audit_events", "R")
      ? db.ccApprovalAuditEvent.findMany({ where: { workspaceId: actor.workspaceId, entityType: table, entityId: id }, orderBy: { eventAt: "desc" }, take: 30 })
      : [],
    can(actor, "audit_events", "R")
      ? db.ccAuditEvent.findMany({ where: { workspaceId: actor.workspaceId, entityTable: table, entityId: id }, orderBy: { recordedAt: "desc" }, take: 30 })
      : [],
  ]);
  const userIds = [...new Set([...states.map((s) => s.actorUserId), ...edits.map((e) => e.userId)].filter((x): x is string => !!x))];
  const users = new Map((await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, surname: true } })).map((u) => [u.id, [u.name, u.surname].filter(Boolean).join(" ")]));
  const when = (d: Date) => d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const items = [
    ...states.map((s) => ({ at: s.eventAt, text: `${humanize(s.oldState ?? "new")} → ${humanize(s.newState)}`, who: users.get(s.actorUserId ?? "") ?? "System" })),
    ...edits.map((e) => {
      const changed = e.changedColumns && typeof e.changedColumns === "object" ? Object.keys(e.changedColumns as object) : [];
      return { at: e.recordedAt, text: `${humanize(e.action)}${changed.length ? `: ${changed.slice(0, 6).map(humanize).join(", ")}${changed.length > 6 ? "…" : ""}` : ""}`, who: users.get(e.userId ?? "") ?? "System" };
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return (
    <Section title="History">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history.</p>
      ) : (
        <ol className="flex flex-col gap-1.5 text-sm">
          {items.slice(0, 40).map((it, i) => (
            <li key={i} className="flex flex-wrap gap-x-2">
              <span className="w-32 shrink-0 text-xs text-muted-foreground">{when(it.at)}</span>
              <span className="min-w-0 flex-1">{it.text}</span>
              <span className="text-xs text-muted-foreground">{it.who}</span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

export default async function RecordPage({ params }: { params: Promise<{ module: string; id: string }> }) {
  const { module: table, id } = await params;
  const def = TABLES[table];
  if (!def) notFound();
  const actor = await getActor();
  if (!actor) redirect("/login");

  let rec: Row;
  try {
    rec = await getRecord(actor, table, id);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const cfg = tableConfig(table);
  const mod = moduleDef(table);
  const metas = fieldMetas(actor, table);
  const labels = await resolveLabels(actor, table, [rec]);
  const codes = codesFor(actor, table);
  const archivable = def.fields.some((f) => f.column === "archived_at");
  const canEdit = codes.includes("U") && (cfg.mode ?? "editable") === "editable" && !rec.archived_at;
  const number = cfg.numbering ? (rec[cfg.numbering.field] as string) : null;
  const labelMeta = metas.find((m) => m.column === cfg.labelField);
  const label = labelMeta ? formatValue(labelMeta, rec[cfg.labelField], labels) : id;
  const statusMeta = cfg.statusField ? metas.find((m) => m.column === cfg.statusField) : undefined;
  const parentLink = cfg.parent ? { table: cfg.parent.table, id: rec[cfg.parent.field] as string } : null;
  const actions = actionsFor(table, rec, codes, archivable);

  const main = metas.filter((m) => !AUDIT_COLUMNS.has(m.column));
  const audit = metas.filter((m) => AUDIT_COLUMNS.has(m.column) && m.column !== "id" && m.column !== "row_version");

  const children = (CHILD_TABLES[table] ?? []).filter((c) => can(actor, c.table, "R"));
  const childData = await Promise.all(
    children.map(async (c) => {
      const r = await listRecords(actor, c.table, { filters: { [c.field]: id }, archived: "exclude", limit: 200, offset: 0 });
      const ccfg = tableConfig(c.table);
      const addable = !rec.archived_at && can(actor, table, "U") && can(actor, c.table, "C") && (ccfg.mode ?? "editable") !== "read-only";
      return { ...c, rows: r.rows, addable, removable: !!ccfg.deletable && can(actor, table, "U") };
    })
  );
  const fixedOrg = typeof rec.mfd_org_id === "string" ? rec.mfd_org_id : table === "mfd_organizations" ? id : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Link href={`/consulting/${table}`} className="hover:underline">
            ← {mod?.label ?? humanize(table)}
          </Link>
          {parentLink && (
            <Link href={`/consulting/${parentLink.table}/${parentLink.id}`} className="hover:underline">
              · parent record
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{number && number !== label ? `${number} · ${label}` : label}</h1>
          {statusMeta && rec[statusMeta.column] ? <Badge variant={statusTone(rec[statusMeta.column])}>{formatValue(statusMeta, rec[statusMeta.column])}</Badge> : null}
          {rec.archived_at ? <Badge variant="outline">Archived</Badge> : null}
          {Array.isArray(rec._redacted) && rec._redacted.length > 0 && <Badge variant="outline">Some fields hidden for your role</Badge>}
        </div>
        {actions.length > 0 && (
          <div className="pt-2">
            <ActionBar slug={def.slug} table={table} id={id} rowVersion={rec.row_version as number | undefined} actions={actions} />
          </div>
        )}
      </div>

      {table === "mfd_organizations" && (
        <Section title="MFD 360">
          <Mfd360 actor={actor} orgId={id} />
        </Section>
      )}

      <Section title="Details">
        <EditableRecord canEdit={canEdit} slug={def.slug} table={table} fields={metas} record={rec} labels={labels}>
          <FieldGrid fields={main} record={rec} labels={labels} />
        </EditableRecord>
      </Section>

      {(table === "document_records" || table === "media_records") && (
        <Section title="File">
          <FilePanel actor={actor} fileId={(rec.file_object_id as string | null) ?? null} />
        </Section>
      )}

      {table === "assessments" && (
        <Section title="Responses">
          <AssessmentPanel actor={actor} rec={rec} />
        </Section>
      )}

      {childData.map((c) => (
        <Section key={c.table} title={c.label}>
          {c.addable && (
            <ChildAdd
              slug={TABLES[c.table].slug}
              table={c.table}
              label={c.label.toLowerCase().replace(/s$/, "")}
              fields={fieldMetas(actor, c.table)}
              fixed={{ [c.field]: id, ...(fixedOrg && TABLES[c.table].fields.some((f) => f.column === "mfd_org_id") ? { mfd_org_id: fixedOrg } : {}) }}
            />
          )}
          <RecordTable actor={actor} table={c.table} rows={c.rows} removable={c.removable} />
        </Section>
      ))}

      <Section title="Record">
        <FieldGrid fields={audit} record={rec} labels={labels} />
      </Section>

      <History actor={actor} table={table} id={id} />
    </div>
  );
}
