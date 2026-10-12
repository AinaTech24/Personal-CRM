"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Label } from "@/components/ui/label";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/components/providers/toast-provider";
import {
  categoryLabel,
  fmtApplied,
  fmtDays,
  leaveDatesLabel,
  LeaveStatusBadge,
  type LeaveRequestRow,
} from "@/components/leave/leave-shared";

const FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "ALL", label: "All requests" },
];

export function LeaveAdminView() {
  const toast = useToast();
  const { socket } = useSocket();
  const [requests, setRequests] = useState<LeaveRequestRow[] | null>(null);
  const [filter, setFilter] = useState("PENDING");
  const [deciding, setDeciding] = useState<{ request: LeaveRequestRow; action: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/leave-requests?scope=all");
    setRequests(res.ok ? (await res.json()).requests : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A new application (or another admin's decision) lands without a refresh.
  useEffect(() => {
    if (!socket) return;
    socket.on("leave_request_changed", load);
    return () => {
      socket.off("leave_request_changed", load);
    };
  }, [socket, load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: requests?.length ?? 0 };
    for (const r of requests ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  const visible = (requests ?? []).filter((r) => filter === "ALL" || r.status === filter);

  async function decide() {
    if (!deciding) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leave-requests/${deciding.request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: deciding.action, adminNote: note || null }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) toast.error("Couldn't save the decision", d.error);
      else toast.success(deciding.action === "approve" ? "Leave approved" : "Leave rejected", deciding.request.user.name);
      setDeciding(null);
      setNote("");
      load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Leave Requests</h1>
          <p className="text-sm text-muted-foreground">
            Approve or reject your team&apos;s leave. Approved leave is marked on their attendance automatically.
          </p>
        </div>
        <Dropdown
          size="sm"
          value={filter}
          onChange={setFilter}
          className="w-48"
          options={FILTERS.map((f) => ({ ...f, label: `${f.label} (${counts[f.value] ?? 0})` }))}
        />
      </div>

      {!requests ? (
        <SkeletonTable rows={5} columns={7} />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {filter === "PENDING" ? "No leave requests are waiting for you." : "Nothing to show here."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    {["Employee", "Applied On", "Leave Dates", "Type", "Days", "Reason", "Status", "Action Date", ""].map((h, i) => (
                      <th key={i} className={`px-4 py-2.5 font-medium ${h === "Days" ? "text-right" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 align-top last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <UserAvatar name={r.user.name} avatarDataUrl={r.user.avatarDataUrl} className="h-7 w-7 text-xs" />
                          <div className="min-w-0">
                            <p className="whitespace-nowrap font-medium">{r.user.name}</p>
                            {r.user.department && <p className="text-xs text-muted-foreground">{r.user.department}</p>}
                          </div>
                        </div>
                      </td>
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
                        {r.adminNote && <p className="mt-1 text-xs text-muted-foreground">Note: {r.adminNote}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <LeaveStatusBadge status={r.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {r.decidedAt ? (
                          <>
                            {format(parseISO(r.decidedAt), "dd MMM yyyy")}
                            {r.decidedByName && <p className="text-xs">by {r.decidedByName}</p>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {r.status === "PENDING" && (
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" onClick={() => setDeciding({ request: r, action: "approve" })}>
                              Approve
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => setDeciding({ request: r, action: "reject" })}>
                              Reject
                            </Button>
                          </div>
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

      <Dialog open={deciding !== null} onOpenChange={(v) => !v && !saving && setDeciding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deciding?.action === "approve" ? "Approve leave" : "Reject leave"}</DialogTitle>
            {deciding && (
              <DialogDescription>
                {deciding.request.user.name} · {leaveDatesLabel(deciding.request.startDate, deciding.request.endDate)} ·{" "}
                {fmtDays(deciding.request.days)} day(s)
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2">
            {deciding && <p className="rounded-md bg-muted/50 p-3 text-sm">{deciding.request.reason}</p>}
            <Label>Note to {deciding?.request.user.name.split(" ")[0]} (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setDeciding(null)}>
              Back
            </Button>
            <Button
              type="button"
              variant={deciding?.action === "reject" ? "destructive" : "default"}
              disabled={saving}
              onClick={decide}
            >
              {saving ? "Saving…" : deciding?.action === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
