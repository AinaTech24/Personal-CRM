import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { can } from "@/lib/mfd/access";
import { getActor } from "@/lib/mfd/actor";
import { moduleDef, TABLES } from "@/lib/mfd/catalog";
import { HttpError, listRecords, parseListParams, resolveLabels } from "@/lib/mfd/engine";
import { formatValue, humanize, statusTone } from "@/lib/mfd/format";
import { tableConfig } from "@/lib/mfd/module-config";
import { fieldMetas } from "@/lib/mfd/ui-meta";

const PAGE = 50;

export default async function ModuleListPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { module: table } = await params;
  const def = TABLES[table];
  if (!def) notFound();
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, table, "R")) redirect("/consulting");

  const sp = await searchParams;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string") usp.set(k, v);
  const page = Math.max(1, Number(usp.get("page")) || 1);
  usp.set("limit", String(PAGE));
  usp.set("offset", String((page - 1) * PAGE));

  const cfg = tableConfig(table);
  const mod = moduleDef(table);
  const metas = fieldMetas(actor, table);
  const byCol = new Map(metas.map((m) => [m.column, m]));
  const columns = cfg.listColumns.filter((c) => byCol.has(c)).map((c) => byCol.get(c)!);
  const statusMeta = cfg.statusField ? byCol.get(cfg.statusField) : undefined;
  const p = parseListParams(table, usp);

  let rows: Record<string, unknown>[] = [];
  let total = 0;
  let blocked: string | null = null;
  try {
    const r = await listRecords(actor, table, p);
    rows = r.rows;
    total = r.total;
  } catch (e) {
    if (e instanceof HttpError && e.status === 400) blocked = "These records are listed from their parent record — open the parent to see them.";
    else throw e;
  }
  const labels = await resolveLabels(actor, table, rows);
  const filterLabels = await resolveLabels(actor, table, [p.filters]);
  const columnFilters = Object.entries(p.filters).filter(([k]) => k !== cfg.statusField);

  const canCreate = can(actor, table, "C") && (cfg.mode ?? "editable") !== "read-only" && !cfg.parent;
  const canExport = can(actor, table, "E");
  const hasArchive = def.fields.some((f) => f.column === "archived_at");
  const title = mod?.label ?? humanize(table);

  const qs = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") u.set(k, v);
    for (const [k, v] of Object.entries(patch)) if (v === null) u.delete(k);
    else u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {mod && <Badge variant="outline">{mod.code}</Badge>}
          <HelpDialog title={title}>
            <HelpSection heading="What this is">
              <p>{mod?.purpose ?? def.purpose ?? "Supporting records."}</p>
              {mod && <p>Primary screen: {mod.screen}.</p>}
            </HelpSection>
            {mod && (
              <HelpSection heading="Ownership">
                <p>
                  Owned by {mod.owner}; records are scoped to {mod.scope === "MFD" ? "the MFD organizations you've been granted" : "the workspace"}. Phase {mod.phase}.
                </p>
              </HelpSection>
            )}
            <HelpSection heading="Rules">
              <ul>
                <li>Every change is versioned and audited; if someone else saved first you&apos;ll be asked to reload.</li>
                <li>Records are archived, never deleted.</li>
                <li>Approvals and status changes that need evidence are checked on save.</li>
              </ul>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex gap-2">
          {canExport && !blocked && (
            <Button asChild size="sm" variant="outline">
              <a href={`/api/v1/${def.slug}${qs({ format: "csv", page: null })}`}>Export CSV</a>
            </Button>
          )}
          {canCreate && (
            <Button asChild size="sm">
              <Link href={`/consulting/${table}/new${p.filters.mfd_org_id ? `?mfd_org_id=${p.filters.mfd_org_id}` : ""}`}>New</Link>
            </Button>
          )}
        </div>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        {columnFilters.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input
          name="q"
          defaultValue={p.q ?? ""}
          placeholder="Search…"
          className="h-9 w-56 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {statusMeta?.options && (
          <select name={statusMeta.column} defaultValue={p.filters[statusMeta.column] ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Any {statusMeta.label.toLowerCase()}</option>
            {statusMeta.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {hasArchive && (
          <select name="archived" defaultValue={p.archived ?? "exclude"} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="exclude">Active</option>
            <option value="only">Archived</option>
            <option value="include">All</option>
          </select>
        )}
        <Button type="submit" size="sm" variant="secondary">
          Apply
        </Button>
      </form>

      {columnFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {columnFilters.map(([k, v]) => {
            const m = byCol.get(k);
            return (
              <Link key={k} href={qs({ [k]: null, page: null })} className="rounded-full border border-border px-2.5 py-1 hover:bg-primary/5">
                {m?.label ?? k}: {m ? formatValue(m, v, filterLabels) : v} ✕
              </Link>
            );
          })}
        </div>
      )}

      {blocked ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">{blocked}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c.column} className="whitespace-nowrap px-3 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-10 text-center text-muted-foreground">
                    Nothing here yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id as string} className="border-t border-border hover:bg-primary/5">
                  {columns.map((c, i) => {
                    const text = formatValue(c, r[c.column], labels);
                    const isStatus = c.column === cfg.statusField;
                    return (
                      <td key={c.column} className="max-w-[260px] truncate px-3 py-2">
                        {i === 0 ? (
                          <Link href={`/consulting/${table}/${r.id as string}`} className="font-medium text-primary hover:underline">
                            {text === "—" ? "Open" : text}
                          </Link>
                        ) : isStatus && r[c.column] ? (
                          <Badge variant={statusTone(r[c.column])}>{text}</Badge>
                        ) : (
                          text
                        )}
                        {i === 0 && Boolean(r.archived_at) && (
                          <Badge variant="outline" className="ml-2">
                            Archived
                          </Badge>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!blocked && total > PAGE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Button asChild size="sm" variant="outline">
                <Link href={qs({ page: String(page - 1) })}>Previous</Link>
              </Button>
            )}
            {page * PAGE < total && (
              <Button asChild size="sm" variant="outline">
                <Link href={qs({ page: String(page + 1) })}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
