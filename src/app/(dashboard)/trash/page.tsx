"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { IconRestore, IconTrash } from "@/components/icons";
import { cn } from "@/lib/utils";

interface TrashItem {
  id: string;
  module: string;
  moduleLabel: string;
  title: string;
  subtitle: string | null;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  expiresAt: string;
}

/** Whole days left before the purge job deletes this for good — never negative, since it's about to be purged either way. */
function daysLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export default function TrashPage() {
  const toast = useToast();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/trash");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load Trash", data.error);
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const modules = useMemo(() => [...new Set(items.map((i) => i.moduleLabel))].sort(), [items]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (moduleFilter && i.moduleLabel !== moduleFilter) return false;
      if (!q) return true;
      return i.title.toLowerCase().includes(q) || (i.subtitle ?? "").toLowerCase().includes(q);
    });
  }, [items, query, moduleFilter]);

  async function restore(item: TrashItem) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/trash/${item.module}/${item.id}/restore`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(`Couldn't restore "${item.title}"`, data.error);
      toast.success(`Restored "${item.title}"`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } finally {
      setBusyId(null);
    }
  }

  async function purge() {
    const item = purgeTarget;
    if (!item) return;
    setPurgeTarget(null);
    const res = await fetch(`/api/trash/${item.module}/${item.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(`Couldn't delete "${item.title}"`, data.error);
    toast.success(`Deleted "${item.title}" permanently`);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-28" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <SkeletonTable rows={8} columns={4} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1.5">
        <h1 className="text-xl font-semibold">Trash</h1>
        <HelpDialog title="Trash — help">
          <HelpSection heading="What this page is for">
            <p>
              Deleting a record moves it here instead of removing it right away. It stays recoverable for 30 days —
              after that it&apos;s purged automatically. You can also delete it permanently yourself at any time.
            </p>
          </HelpSection>
          <HelpSection heading="What you can see">
            <p>Only what you could already see in the live module — Trash doesn&apos;t widen anyone&apos;s access, it just holds on to what they deleted.</p>
          </HelpSection>
        </HelpDialog>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            Deleted items
            <span className="ml-2 text-sm font-normal text-muted-foreground">{filtered.length}</span>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {modules.length > 1 && (
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setModuleFilter("")}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    !moduleFilter ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>
                {modules.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModuleFilter(m)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      moduleFilter === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Trash…" className="sm:w-56" />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {items.length === 0 ? "Trash is empty." : "Nothing matches that search."}
            </p>
          ) : (
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="sticky top-0 z-10 bg-card px-2 py-2 font-medium">Name</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">Module</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">Deleted</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">Expires</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => {
                    const left = daysLeft(item.expiresAt);
                    const busy = busyId === item.id;
                    return (
                      <tr key={`${item.module}-${item.id}`} className="border-b border-border/50 last:border-0">
                        <td className="max-w-[260px] px-2 py-2">
                          <p className="truncate font-medium">{item.title}</p>
                          {item.subtitle && <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <Badge variant="secondary">{item.moduleLabel}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                          {new Date(item.deletedAt).toLocaleDateString()}
                          {item.deletedBy && ` by ${item.deletedBy.name}`}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                          {left === 0 ? "Today" : `${left} day${left === 1 ? "" : "s"}`}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Tooltip label="Recover">
                              <Button type="button" size="icon" variant="outline" disabled={busy} onClick={() => restore(item)}>
                                <IconRestore className="h-4 w-4" />
                              </Button>
                            </Tooltip>
                            <Tooltip label="Delete permanently">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setPurgeTarget(item)}
                                className="text-destructive hover:bg-destructive/10"
                              >
                                <IconTrash className="h-4 w-4" />
                              </Button>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!purgeTarget}
        onOpenChange={(v) => !v && setPurgeTarget(null)}
        title={`Delete "${purgeTarget?.title ?? ""}" permanently?`}
        description="This can't be undone — it won't wait out the rest of its 30 days in Trash."
        confirmLabel="Delete permanently"
        onConfirm={purge}
      />
    </div>
  );
}
