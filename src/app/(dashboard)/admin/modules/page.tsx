"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import * as Popover from "@radix-ui/react-popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dropdown } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { EightDotsRotate } from "@/components/ui/loader";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { IconExternalLink, IconEye, IconFilter, IconPencil, IconTrash } from "@/components/icons";
import { ADMIN_MODULES, moduleByKey, type ModuleColumn, type ModuleConfig } from "@/lib/admin-modules";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown> & { id: string };

/** One cell's worth of text from an arbitrary payload value. */
function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
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
    return name ? String(name) : "—";
  }
  return String(value);
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
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [renaming, setRenaming] = useState<Row | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [viewing, setViewing] = useState<Row | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterOpen, setFilterOpen] = useState(false);

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

  const filterableColumns = useMemo(() => columns.filter((c) => c.filterable), [columns]);
  const activeFilterCount = Object.keys(filters).length;

  /** Distinct values for a column, taken from the rows on screen. */
  const optionsFor = useCallback(
    (columnKey: string) => {
      const col = columns.find((c) => c.key === columnKey);
      if (!col) return [];
      const seen = new Set<string>();
      for (const row of rows) {
        const v = col.get(row);
        if (v && v !== "—") seen.add(v);
      }
      return [...seen].sort();
    },
    [rows, mod]
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
  }, [rows, query, filters, mod]);

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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Modules management</h1>
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
              m.key === activeKey ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Deliberately not mode="wait". That holds the incoming tab back until
          the outgoing one's exit finishes, so anywhere those animations stall —
          a throttled tab, reduced motion — the content never changes at all.
          Cross-fading can jog the card height; a tab that ignores you is worse. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={activeKey}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
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
            {filterableColumns.length > 0 && (
              <Popover.Root open={filterOpen} onOpenChange={setFilterOpen}>
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Filters"
                    className={cn(
                      "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input transition-colors hover:bg-accent",
                      activeFilterCount > 0 && "border-primary text-primary"
                    )}
                  >
                    <IconFilter className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content
                    align="end"
                    sideOffset={6}
                    className="z-50 w-64 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-medium">Filters</p>
                      {activeFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilters({})}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    {/* Options come from the rows actually loaded, so they can't
                        list a status no record uses or miss one added later. */}
                    <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
                      {filterableColumns.map((c) => (
                        <div key={c.key} className="flex flex-col gap-1">
                          <Label className="text-xs text-muted-foreground">{c.label}</Label>
                          <Dropdown
                            size="sm"
                            value={filters[c.key] ?? ""}
                            onChange={(v) =>
                              setFilters((prev) => {
                                const next = { ...prev };
                                if (v) next[c.key] = v;
                                else delete next[c.key];
                                return next;
                              })
                            }
                            placeholder="Any"
                            options={[
                              { value: "", label: "Any" },
                              ...optionsFor(c.key).map((v) => ({ value: v, label: v })),
                            ]}
                          />
                        </div>
                      ))}
                    </div>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <EightDotsRotate className="h-7 w-7" />
            </div>
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
                      <th key={c.key} className={cn("px-2 py-2 font-medium", c.secondary && "hidden sm:table-cell")}>
                        {c.label}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-accent/40">
                      {columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn("max-w-[220px] truncate px-2 py-2", c.secondary && "hidden sm:table-cell")}
                        >
                          {c.get(row)}
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip label="View">
                            <button
                              type="button"
                              aria-label={`View ${mod.nameOf(row)}`}
                              onClick={() => setViewing(row)}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <IconEye className="h-4 w-4" />
                            </button>
                          </Tooltip>
                          {mod.hrefFor && (
                            <Tooltip label="Open">
                              <Link
                                href={mod.hrefFor(row.id)}
                                aria-label={`Open ${mod.nameOf(row)}`}
                                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                              >
                                <IconPencil className="h-4 w-4" />
                              </button>
                            </Tooltip>
                          )}
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
        </motion.div>
      </AnimatePresence>

      {/* Every field the console holds for a record, without leaving the page.
          Built from the payload rather than the columns, so it shows more than
          the table had room for. */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{viewing ? mod.nameOf(viewing) : ""}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {viewing && (
              <dl className="flex flex-col divide-y divide-border text-sm">
                {readableFields(viewing).map(([key, value]) => (
                  <div key={key} className="flex gap-4 py-1.5">
                    <dt className="w-40 shrink-0 text-muted-foreground">{humanize(key)}</dt>
                    <dd className="min-w-0 flex-1 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </DialogBody>
          {viewing && mod.hrefFor && (
            <DialogFooter>
              <Link href={mod.hrefFor(viewing.id)}>
                <Button type="button" variant="outline" className="gap-1.5">
                  <IconExternalLink className="h-4 w-4" />
                  Open in {mod.label}
                </Button>
              </Link>
            </DialogFooter>
          )}
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
