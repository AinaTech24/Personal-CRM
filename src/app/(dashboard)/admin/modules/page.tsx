"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import * as Popover from "@radix-ui/react-popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Dropdown } from "@/components/ui/dropdown";
import { Textarea } from "@/components/ui/textarea";
import { coerceForSave, editableFields, toDateInput } from "@/lib/admin-fields";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { IconChevronDown, IconExternalLink, IconEye, IconPencil, IconTrash } from "@/components/icons";
import { ADMIN_MODULES, moduleByKey, type ModuleColumn, type ModuleConfig } from "@/lib/admin-modules";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown> & { id: string };

/** One cell's worth of text from an arbitrary payload value. */
function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
    }
    // Enum-looking values read better lowercased than shouted.
    if (/^[A-Z][A-Z_]+$/.test(value)) return value.replace(/_/g, " ").toLowerCase();
    return value;
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const name = o.name ?? o.title ?? o.email;
    return name ? String(name) : "";
  }
  return String(value);
}

/**
 * A column heading that doubles as its own filter.
 *
 * Options come from the rows on screen, so a column can't offer a value no
 * record uses. Filtering shows in the heading itself — the chosen value
 * replaces the label — so it's obvious which column is narrowing the table.
 */
function ColumnFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (options.length === 0) return <>{label}</>;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1 whitespace-nowrap uppercase tracking-wide transition-colors hover:text-foreground",
            value && "text-primary"
          )}
        >
          {value || label}
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-64 w-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <button
            type="button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center rounded px-2 py-1.5 text-left text-xs normal-case tracking-normal hover:bg-primary/5",
              !value && "text-primary"
            )}
          >
            All
          </button>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center rounded px-2 py-1.5 text-left text-xs normal-case tracking-normal hover:bg-primary/5",
                value === o && "text-primary"
              )}
            >
              {o}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Marks the searched text inside a cell.
 *
 * Case-insensitive, but keeps what the record actually says rather than
 * rewriting it to match the query.
 */
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-sm bg-amber-400/40 px-0.5 text-inherit">
        {text.slice(at, at + q.length)}
      </mark>
    );
    from = at + q.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

/** `createdAt` → "Created at". */
function humanize(key: string) {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Flattens a record into label/value pairs worth reading.
 *
 * Skips ids and internals, and renders a related object by its name rather
 * than dumping JSON — a raw payload is not a detail view. Base64 blobs are
 * summarised rather than printed, since one would fill the dialog.
 */
function readableFields(row: Row): [string, string][] {
  const out: [string, string][] = [];
  for (const [key, value] of Object.entries(row)) {
    if (key === "id" || key.endsWith("Id") || key === "_count") continue;
    if (value === null || value === undefined || value === "") continue;

    if (typeof value === "string") {
      if (value.startsWith("data:")) {
        out.push([key, `${(value.length / 1024).toFixed(0)} KB file`]);
        continue;
      }
      // ISO timestamps read better as local dates.
      const asDate = /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
      out.push([key, asDate && !Number.isNaN(asDate.getTime()) ? asDate.toLocaleString() : value]);
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out.push([key, String(value)]);
      continue;
    }
    if (Array.isArray(value)) {
      out.push([key, `${value.length} item${value.length === 1 ? "" : "s"}`]);
      continue;
    }
    if (typeof value === "object") {
      const o = value as Record<string, unknown>;
      const name = o.name ?? o.title ?? o.email;
      if (name) out.push([key, String(name)]);
      continue;
    }
  }
  return out;
}

/**
 * Modules management.
 *
 * One console over every record in the CRM for admins, rather than hunting
 * through each module's own screen. Everything goes through the entities'
 * existing endpoints, so their permission rules still decide what a given
 * admin may see and remove.
 */
export default function ModulesManagementPage() {
  const toast = useToast();
  const [activeKey, setActiveKey] = useState(ADMIN_MODULES[0].key);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [renaming, setRenaming] = useState<Row | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [viewing, setViewing] = useState<Row | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  const mod: ModuleConfig = moduleByKey(activeKey);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(mod.listPath);
      const data = await res.json().catch(() => ({}));
      setRows(res.ok ? ((data[mod.listKey] as Row[]) ?? []) : []);
      if (!res.ok) toast.error(`Couldn't load ${mod.label.toLowerCase()}`, data.error);
    } finally {
      setLoading(false);
      setFirstLoad(false);
    }
    // toast is stable from its provider; re-running on it would refetch endlessly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod.listPath, mod.listKey, mod.label]);

  useEffect(() => {
    setQuery("");
    // Filters name columns of the module being left, so they mean nothing here.
    setFilters({});
    load();
  }, [load]);

  /**
   * Every field the payload carries, not just the curated few.
   *
   * Derived from the rows rather than listed per module: the configs would
   * otherwise need updating each time a model gains a field, and would quietly
   * omit it until someone noticed. Curated columns keep their order and stay
   * visible on a phone; the rest follow, hidden below `sm` and reachable by
   * scrolling the table sideways.
   */
  const columns = useMemo(() => {
    const configured = mod.columns;
    const taken = new Set(configured.map((c) => c.key));
    const extras: ModuleColumn[] = [];

    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (taken.has(key)) continue;
        if (key === "id" || key.endsWith("Id") || key === "_count") continue;
        const sample = row[key];
        if (sample === null || sample === undefined) continue;
        // Arrays and blobs don't belong in a cell; the view dialog summarises them.
        if (Array.isArray(sample)) continue;
        if (typeof sample === "string" && sample.startsWith("data:")) continue;
        taken.add(key);
        extras.push({
          key,
          label: humanize(key),
          secondary: true,
          get: (r) => cellText(r[key]),
        });
      }
    }
    return [...configured, ...extras];
  }, [mod, rows]);

  const noFilter = useMemo(() => new Set(mod.noFilter ?? []), [mod]);
  const isFilterable = useCallback((key: string) => !noFilter.has(key), [noFilter]);
  const activeFilterCount = Object.keys(filters).length;

  /** Distinct values for a column, taken from the rows on screen. */
  const optionsFor = useCallback(
    (columnKey: string) => {
      const col = columns.find((c) => c.key === columnKey);
      if (!col) return [];
      const seen = new Set<string>();
      for (const row of rows) {
        const v = col.get(row);
        if (v) seen.add(v);
      }
      return [...seen].sort();
    },
    [rows, columns]
  );

  // Search matches the rendered text, so what you type matches what you can
  // see rather than fields hidden in the payload. Filters are exact on the
  // same rendered value, which is what the options were built from.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !columns.some((c) => c.get(row).toLowerCase().includes(q))) return false;
      return Object.entries(filters).every(([key, want]) => {
        const col = columns.find((c) => c.key === key);
        return !col || col.get(row) === want;
      });
    });
  }, [rows, query, filters, columns]);

  async function doDelete() {
    if (!pendingDelete) return;
    try {
      const res = await fetch(`${mod.basePath}/${pendingDelete.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The endpoint explains why (in use, forbidden) — pass that on rather
        // than a generic failure.
        toast.error("Couldn't delete", data.error);
        return;
      }
      toast.success(`${mod.nameOf(pendingDelete)} deleted`);
      setPendingDelete(null);
      await load();
    } finally {
      // ConfirmDialog owns the busy state while onConfirm runs.
    }
  }

  function startEditing(row: Row) {
    const seed: Record<string, unknown> = {};
    for (const f of editableFields(row, rows)) seed[f.key] = f.value;
    setDraft(seed);
    setEditing(true);
  }

  /**
   * Saves only what changed.
   *
   * Sending the whole record would overwrite fields this console never showed,
   * and would fail validation on any the endpoint treats as read-only. A diff
   * also means opening and closing the form writes nothing at all.
   */
  async function saveEdits() {
    if (!viewing) return;
    const fields = editableFields(viewing, rows);
    const patch: Record<string, unknown> = {};
    for (const f of fields) {
      const next = coerceForSave(f.kind, draft[f.key] as string | boolean);
      const before =
        f.kind === "date" ? (f.value ? new Date(String(f.value)).toISOString() : null) : f.value;
      if (JSON.stringify(next) !== JSON.stringify(before)) patch[f.key] = next;
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${mod.basePath}/${viewing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The endpoint knows which field it rejected; pass that through.
        toast.error("Couldn't save", data.error);
        return;
      }
      toast.success("Saved");
      setEditing(false);
      setViewing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function doRename() {
    if (!renaming || !renameValue.trim()) return;
    const res = await fetch(`${mod.basePath}/${renaming.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't rename", data.error);
    toast.success("Renamed");
    setRenaming(null);
    await load();
  }

  // The whole page stands in for itself on the very first load — heading, tabs,
  // search and table. Rendering the real chrome around an empty card makes the
  // page look broken rather than loading, and everything shifts when data lands.
  if (firstLoad) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-52" />
        <div className="flex gap-1">
          {ADMIN_MODULES.map((m) => (
            <Skeleton key={m.key} className="h-8 w-24 shrink-0" />
          ))}
        </div>
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-full sm:w-64" />
          </CardHeader>
          <CardContent>
            <SkeletonTable rows={8} columns={6} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        <h1 className="text-xl font-semibold">Modules management</h1>
        <HelpDialog title="Modules management — help">
          <HelpSection heading="What this page is for">
            <p>A single raw-data browser across every module&apos;s records — switch between modules with the tabs above to inspect, search, and export what&apos;s stored, without going to each module&apos;s own page.</p>
          </HelpSection>
          <HelpSection heading="Who can see this">
            <p>Admins and Super Admins only.</p>
          </HelpSection>
        </HelpDialog>
      </div>

      {/* Scrolls on a phone rather than wrapping into a wall of chips. */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {ADMIN_MODULES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setActiveKey(m.key)}
            className={cn(
              "shrink-0 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              m.key === activeKey ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-primary/5"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* One keyed child, no exit. An exiting copy is block-level, so it
          stacked below the incoming table rather than cross-fading — two
          tables at once. Remounting on the key replays the entrance, and the
          rows stagger in behind it, which reads as the table settling rather
          than a hard cut. */}
      <motion.div
        key={activeKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>
              {mod.label}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {loading ? "" : `${filtered.length}${filtered.length !== rows.length ? ` of ${rows.length}` : ""}`}
              </span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${mod.label.toLowerCase()}…`}
                className="flex-1 sm:w-64"
              />
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters({})}
                  className="shrink-0 whitespace-nowrap rounded-md border border-input px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                >
                  Clear {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <SkeletonTable rows={6} columns={5} />
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {rows.length === 0 ? `No ${mod.label.toLowerCase()} yet.` : "Nothing matches that search."}
              </p>
            ) : (
              // Capped so a long list doesn't push the page down forever; the
              // scrollbar itself is hidden app-wide.
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      {columns.map((c) => (
                        <th
                          key={c.key}
                          className={cn(
                            "sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium",
                            c.secondary && "hidden sm:table-cell"
                          )}
                        >
                          {/* The filter lives in the column it filters. A separate
                            panel hid which columns were filterable at all, and
                            put the control far from the data it acts on. */}
                          {isFilterable(c.key) ? (
                            <ColumnFilter
                              label={c.label}
                              value={filters[c.key] ?? ""}
                              options={optionsFor(c.key)}
                              onChange={(v) =>
                                setFilters((prev) => {
                                  const next = { ...prev };
                                  if (v) next[c.key] = v;
                                  else delete next[c.key];
                                  return next;
                                })
                              }
                            />
                          ) : (
                            c.label
                          )}
                        </th>
                      ))}
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, rowIndex) => (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        // Capped so a long table finishes settling quickly rather
                        // than trickling in for seconds.
                        transition={{ duration: 0.2, delay: Math.min(rowIndex * 0.02, 0.3) }}
                        className="border-b border-border/50 last:border-0 hover:bg-primary/5"
                      >
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            className={cn("max-w-[220px] truncate px-2 py-2", c.secondary && "hidden sm:table-cell")}
                          >
                            <Highlighted text={c.get(row)} query={query} />
                          </td>
                        ))}
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip label="View">
                              <button
                                type="button"
                                aria-label={`View ${mod.nameOf(row)}`}
                                onClick={() => setViewing(row)}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                              >
                                <IconEye className="h-4 w-4" />
                              </button>
                            </Tooltip>
                            {mod.hrefFor && (
                              <Tooltip label="Open">
                                <Link
                                  href={mod.hrefFor(row.id)}
                                  aria-label={`Open ${mod.nameOf(row)}`}
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                                >
                                  <IconExternalLink className="h-4 w-4" />
                                </Link>
                              </Tooltip>
                            )}
                            {/* Only departments are simple enough to edit inline;
                              the rest open in their own module, where the full
                              form and its validation already live. */}
                            {mod.key === "departments" && (
                              <Tooltip label="Rename">
                                <button
                                  type="button"
                                  aria-label={`Rename ${mod.nameOf(row)}`}
                                  onClick={() => {
                                    setRenaming(row);
                                    setRenameValue(mod.nameOf(row));
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                                >
                                  <IconPencil className="h-4 w-4" />
                                </button>
                              </Tooltip>
                            )}
                            {!mod.noDelete && (
                              <Tooltip label="Delete">
                                <button
                                  type="button"
                                  aria-label={`Delete ${mod.nameOf(row)}`}
                                  onClick={() => setPendingDelete(row)}
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <IconTrash className="h-4 w-4" />
                                </button>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Every field the console holds for a record, without leaving the page.
          Built from the payload rather than the columns, so it shows more than
          the table had room for. */}
      <Dialog open={!!viewing} onOpenChange={(v) => { if (!v) { setViewing(null); setEditing(false); } }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{viewing ? mod.nameOf(viewing) : ""}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {viewing && !editing && (
              <dl className="flex flex-col divide-y divide-border text-sm">
                {readableFields(viewing).map(([key, value]) => (
                  <div key={key} className="flex gap-4 py-1.5">
                    <dt className="w-40 shrink-0 text-muted-foreground">{humanize(key)}</dt>
                    <dd className="min-w-0 flex-1 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {viewing && editing && (
              <div className="flex flex-col gap-3">
                {editableFields(viewing, rows).map((f) => {
                  const current = draft[f.key];
                  return (
                    <div key={f.key} className="flex flex-col gap-1.5">
                      <Label htmlFor={`edit-${f.key}`}>{f.label}</Label>
                      {f.kind === "boolean" ? (
                        <Dropdown
                          id={`edit-${f.key}`}
                          value={String(current ?? false)}
                          onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v === "true" }))}
                          options={[
                            { value: "true", label: "Yes" },
                            { value: "false", label: "No" },
                          ]}
                        />
                      ) : f.kind === "enum" ? (
                        <Dropdown
                          id={`edit-${f.key}`}
                          value={String(current ?? "")}
                          onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                          options={(f.options ?? []).map((o) => ({ value: o, label: o.replace(/_/g, " ").toLowerCase() }))}
                        />
                      ) : f.kind === "date" ? (
                        <Input
                          id={`edit-${f.key}`}
                          type="date"
                          value={toDateInput(current)}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                      ) : f.kind === "number" ? (
                        <Input
                          id={`edit-${f.key}`}
                          type="number"
                          value={current === null || current === undefined ? "" : String(current)}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                      ) : f.kind === "textarea" ? (
                        <Textarea
                          id={`edit-${f.key}`}
                          value={String(current ?? "")}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                      ) : (
                        <Input
                          id={`edit-${f.key}`}
                          value={String(current ?? "")}
                          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {viewing && !editing && mod.hrefFor && (
              <Link href={mod.hrefFor(viewing.id)}>
                <Button type="button" variant="outline" className="gap-1.5">
                  <IconExternalLink className="h-4 w-4" />
                  Open in {mod.label}
                </Button>
              </Link>
            )}
            {viewing && !editing && (
              <Button type="button" onClick={() => startEditing(viewing)} className="gap-1.5">
                <IconPencil className="h-4 w-4" />
                Edit
              </Button>
            )}
            {viewing && editing && (
              <>
                <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                  Cancel
                </Button>
                <Button type="button" onClick={saveEdits} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title={pendingDelete ? `Delete ${mod.nameOf(pendingDelete)}?` : "Delete"}
        description="This permanently removes the record and anything attached to it. It can't be undone."
        confirmLabel="Delete permanently"
        onConfirm={doDelete}
      />

      {/* Rename needs a field, which ConfirmDialog doesn't take, so it gets a
          dialog of its own rather than bending that one out of shape. */}
      <Dialog open={!!renaming} onOpenChange={(v) => !v && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename department</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Department name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  doRename();
                }
              }}
            />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={doRename} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
