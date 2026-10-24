"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import * as Popover from "@radix-ui/react-popover";
import { IconFilter } from "@/components/icons";
import { cn } from "@/lib/utils";

interface AuditLog {
  id: string;
  model: string;
  action: string;
  summary: string;
  createdAt: string;
}

const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  update: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  delete: "bg-destructive/15 text-destructive",
};

/**
 * A user's own activity, everywhere in the CRM — every create/update/delete
 * they performed, newest first. Same underlying log as the admin-only "View
 * logs" page, just scoped to this one person via /api/audit-logs/mine so it
 * can be safely shown to every user without exposing anyone else's records.
 */
export default function MyActivityPage() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit-logs/mine");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load your activity", data.error);
      setLogs(data.logs ?? []);
      setModels(data.models ?? []);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter((l) => {
      if (model && l.model !== model) return false;
      if (!q) return true;
      return l.summary.toLowerCase().includes(q) || l.model.toLowerCase().includes(q);
    });
  }, [logs, query, model]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40" />
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-9 w-full sm:w-64" />
          </CardHeader>
          <CardContent>
            <SkeletonTable rows={10} columns={3} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">My Activity</h1>
          <HelpDialog title="My Activity — help">
            <HelpSection heading="What this page is for">
              <p>A personal feed of what you&apos;ve created, updated, or been assigned, across every module — filterable by module with the dropdown.</p>
            </HelpSection>
          </HelpDialog>
        </div>

        <Popover.Root open={filterOpen} onOpenChange={setFilterOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label="Filter by module"
              className={cn(
                "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input transition-colors hover:bg-primary/5",
                model && "border-primary text-primary"
              )}
            >
              <IconFilter className="h-4 w-4" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={6}
              className="z-50 max-h-72 w-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              <button
                type="button"
                onClick={() => {
                  setModel("");
                  setFilterOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-primary/5",
                  !model && "text-primary"
                )}
              >
                All modules
                <span className="text-xs text-muted-foreground">{logs.length}</span>
              </button>
              {models.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setModel(m);
                    setFilterOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-primary/5",
                    model === m && "text-primary"
                  )}
                >
                  {m}
                  <span className="text-xs text-muted-foreground">{logs.filter((l) => l.model === m).length}</span>
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>
              What you&apos;ve done
              <span className="ml-2 text-sm font-normal text-muted-foreground">{filtered.length}</span>
            </CardTitle>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your activity…"
              className="sm:w-64"
            />
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {logs.length === 0 ? "Nothing recorded yet." : "Nothing matches that search."}
              </p>
            ) : (
              <div className="max-h-[65vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">When</th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">Action</th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">What</th>
                      <th className="sticky top-0 z-10 hidden whitespace-nowrap bg-card px-2 py-2 font-medium sm:table-cell">
                        Module
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log) => (
                      <tr key={log.id} className="border-b border-border/50 last:border-0">
                        <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="px-2 py-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium",
                              ACTION_STYLE[log.action] ?? "bg-muted text-muted-foreground"
                            )}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="max-w-[320px] truncate px-2 py-2">{log.summary}</td>
                        <td className="hidden whitespace-nowrap px-2 py-2 text-muted-foreground sm:table-cell">{log.model}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
