"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { IconCopy, IconEye } from "@/components/icons";
import { cn } from "@/lib/utils";

interface AuditLog {
  id: string;
  model: string;
  action: string;
  recordId: string | null;
  summary: string;
  changes: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

/** Which module screen a logged record belongs to, for the row's click target. */
const MODEL_ROUTES: Record<string, string> = {
  Lead: "/leads",
  Task: "/tasks",
  Project: "/projects",
  Meeting: "/meetings",
  Quotation: "/quotations",
  Invoice: "/invoices",
  Department: "/admin/departments",
  User: "/admin/users",
  Attendance: "/admin/attendance",
  Conversation: "/messages",
  Message: "/messages",
};

const ACTION_STYLE: Record<string, string> = {
  create: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  update: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  delete: "bg-destructive/15 text-destructive",
};

/** Marks the searched text, keeping the record's own casing. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (; ;) {
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

/**
 * Activity log.
 *
 * Every write in the CRM, newest first. Entries are produced by the Prisma
 * extension in db.ts rather than by each route, so this covers endpoints
 * nobody thought to instrument.
 */
export default function AuditLogsPage() {
  const toast = useToast();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("");
  const [viewing, setViewing] = useState<AuditLog | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/audit-logs");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load the log", data.error);
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
      return (
        l.summary.toLowerCase().includes(q) ||
        (l.actorName ?? "").toLowerCase().includes(q) ||
        l.model.toLowerCase().includes(q)
      );
    });
  }, [logs, query, model]);

  function copyEntry(log: AuditLog) {
    const text = [
      log.summary,
      `by ${log.actorName ?? "system"}`,
      new Date(log.createdAt).toLocaleString(),
      log.changes ? JSON.stringify(log.changes, null, 2) : "",
    ]
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied"),
      () => toast.error("Couldn't copy")
    );
  }

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
            <SkeletonTable rows={10} columns={5} />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">View logs</h1>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setModel("")}
          className={cn(
            "shrink-0 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
            !model ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
          )}
        >
          All
        </button>
        {models.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModel(m)}
            className={cn(
              "shrink-0 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
              model === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {m}
          </button>
        ))}
      </div>

      <motion.div
        key={model}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>
              Activity
              <span className="ml-2 text-sm font-normal text-muted-foreground">{filtered.length}</span>
            </CardTitle>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the log…"
              className="sm:w-64"
            />
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {logs.length === 0 ? "Nothing recorded yet." : "Nothing matches that search."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">When</th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">Action</th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 font-medium">What</th>
                      <th className="sticky top-0 z-10 hidden whitespace-nowrap bg-card px-2 py-2 font-medium sm:table-cell">
                        Module
                      </th>
                      <th className="sticky top-0 z-10 hidden whitespace-nowrap bg-card px-2 py-2 font-medium sm:table-cell">
                        By
                      </th>
                      <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-2 py-2 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((log) => {
                      const target = MODEL_ROUTES[log.model];
                      return (
                        <tr
                          key={log.id}
                          onClick={() => target && router.push(target)}
                          className={cn(
                            "border-b border-border/50 last:border-0 hover:bg-primary/10",
                            target && "cursor-pointer"
                          )}
                        >
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
                          <td className="max-w-[320px] truncate px-2 py-2">
                            <Highlighted text={log.summary} query={query} />
                          </td>
                          <td className="hidden whitespace-nowrap px-2 py-2 sm:table-cell">
                            <Highlighted text={log.model} query={query} />
                          </td>
                          <td className="hidden whitespace-nowrap px-2 py-2 text-muted-foreground sm:table-cell">
                            <Highlighted text={log.actorName ?? "system"} query={query} />
                          </td>
                          <td className="px-2 py-2">
                            {/* The row navigates, so these must not. */}
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip label="View">
                                <button
                                  type="button"
                                  aria-label={`View ${log.summary}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewing(log);
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  <IconEye className="h-4 w-4" />
                                </button>
                              </Tooltip>
                              <Tooltip label="Copy">
                                <button
                                  type="button"
                                  aria-label={`Copy ${log.summary}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyEntry(log);
                                  }}
                                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                >
                                  <IconCopy className="h-4 w-4" />
                                </button>
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
      </motion.div>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{viewing?.summary}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {viewing && (
              <dl className="flex flex-col divide-y divide-border text-sm">
                <div className="flex gap-4 py-1.5">
                  <dt className="w-32 shrink-0 text-muted-foreground">When</dt>
                  <dd>{new Date(viewing.createdAt).toLocaleString()}</dd>
                </div>
                <div className="flex gap-4 py-1.5">
                  <dt className="w-32 shrink-0 text-muted-foreground">By</dt>
                  <dd>{viewing.actorName ?? "system"}</dd>
                </div>
                <div className="flex gap-4 py-1.5">
                  <dt className="w-32 shrink-0 text-muted-foreground">Module</dt>
                  <dd>{viewing.model}</dd>
                </div>
                <div className="flex gap-4 py-1.5">
                  <dt className="w-32 shrink-0 text-muted-foreground">Record</dt>
                  <dd className="break-all">{viewing.recordId ?? "—"}</dd>
                </div>
                {viewing.changes && (
                  <div className="flex flex-col gap-1.5 py-2">
                    <dt className="text-muted-foreground">Changed</dt>
                    <dd>
                      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                        {JSON.stringify(viewing.changes, null, 2)}
                      </pre>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
