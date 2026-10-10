"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonCards, SkeletonTable } from "@/components/ui/skeleton";
import { IconCalendar, IconCheck, IconClock, IconPlus, IconX } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { ApplyLeaveDialog } from "@/components/leave/apply-leave-dialog";
import {
  categoryLabel,
  fmtApplied,
  fmtDays,
  leaveDatesLabel,
  LeaveStatusBadge,
  type LeaveRequestRow,
} from "@/components/leave/leave-shared";
import { format, parseISO } from "date-fns";

interface Summary {
  taken: number;
  balance: number;
  pending: number;
  rejected: number;
}

const pad = (n: number) => (Number.isInteger(n) ? String(n).padStart(2, "0") : n.toFixed(1));

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <span className={tone}>{icon}</span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function LeaveView() {
  const toast = useToast();
  const [requests, setRequests] = useState<LeaveRequestRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequestRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/leave-requests");
    if (!res.ok) {
      setRequests([]);
      return;
    }
    const d = await res.json();
    setRequests(d.requests);
    setSummary(d.summary);
    setYear(d.year);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel(r: LeaveRequestRow) {
    const res = await fetch(`/api/leave-requests/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error("Couldn't cancel the request", d.error);
    }
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My Leave</h1>
          <p className="text-sm text-muted-foreground">Apply for leave and follow your requests.</p>
        </div>
        <Button type="button" onClick={() => setApplyOpen(true)}>
          <IconPlus className="h-4 w-4" />
          Apply for leave
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Leave dashboard{year ? ` · ${year}` : ""}</h2>
        {!summary ? (
          <SkeletonCards count={4} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard icon={<IconCalendar className="h-5 w-5" />} label="Total Leave Taken" value={pad(summary.taken)} tone="text-muted-foreground" />
            <StatCard icon={<IconCheck className="h-5 w-5" />} label="Leave Balance" value={pad(summary.balance)} tone="text-emerald-500" />
            <StatCard icon={<IconClock className="h-5 w-5" />} label="Pending Requests" value={pad(summary.pending)} tone="text-amber-500" />
            <StatCard icon={<IconX className="h-5 w-5" />} label="Rejected Requests" value={pad(summary.rejected)} tone="text-destructive" />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Leave request history</h2>
        {!requests ? (
          <SkeletonTable rows={4} columns={6} />
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              You haven&apos;t applied for any leave yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      {["Applied On", "Leave Dates", "Type", "Days", "Reason", "Status", "Action Date", ""].map((h, i) => (
                        <th key={i} className={`px-4 py-2.5 font-medium ${h === "Days" ? "text-right" : ""}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id} className="border-b border-border/50 align-top last:border-0">
                        <td className="whitespace-nowrap px-4 py-3">{fmtApplied(r.appliedAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{leaveDatesLabel(r.startDate, r.endDate)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {categoryLabel(r.category)}
                          {r.isHalfDay && <span className="text-muted-foreground"> (half)</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtDays(r.days)}</td>
                        <td className="max-w-64 px-4 py-3">
                          <p className="line-clamp-2 break-words" title={r.reason}>
                            {r.reason}
                          </p>
                          {r.adminNote && <p className="mt-1 text-xs text-muted-foreground">Admin: {r.adminNote}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <LeaveStatusBadge status={r.status} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {r.decidedAt ? format(parseISO(r.decidedAt), "dd MMM yyyy") : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {r.status === "PENDING" && (
                            <Button type="button" size="sm" variant="outline" onClick={() => setCancelTarget(r)}>
                              Cancel
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} onApplied={load} />
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        title="Cancel this leave request?"
        description={cancelTarget ? `${leaveDatesLabel(cancelTarget.startDate, cancelTarget.endDate)} will no longer be requested.` : ""}
        confirmLabel="Cancel request"
        loadingLabel="Cancelling…"
        onConfirm={() => (cancelTarget ? cancel(cancelTarget) : undefined)}
      />
    </div>
  );
}
