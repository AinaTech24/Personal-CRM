"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { EightDotsRotate } from "@/components/ui/loader";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { IconExternalLink, IconPencil, IconTrash } from "@/components/icons";
import { ADMIN_MODULES, moduleByKey, type ModuleConfig } from "@/lib/admin-modules";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown> & { id: string };

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
    load();
  }, [load]);

  // Filter over the rendered text, so what you type matches what you can see
  // rather than fields hidden in the payload.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => mod.columns.some((c) => c.get(row).toLowerCase().includes(q)));
  }, [rows, query, mod]);

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
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              m.key === activeKey ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            {mod.label}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {loading ? "" : `${filtered.length}${filtered.length !== rows.length ? ` of ${rows.length}` : ""}`}
            </span>
          </CardTitle>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${mod.label.toLowerCase()}…`}
            className="sm:w-64"
          />
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    {mod.columns.map((c) => (
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
                      {mod.columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn("max-w-[220px] truncate px-2 py-2", c.secondary && "hidden sm:table-cell")}
                        >
                          {c.get(row)}
                        </td>
                      ))}
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
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
