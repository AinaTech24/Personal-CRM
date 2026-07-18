"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AttendanceStatus, AttendanceApproval, HalfDayReason } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { EightDotsRotate } from "@/components/ui/loader";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { IconFileSpreadsheet, IconSettings, IconCheck, IconX, IconPencil } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { StatusBadge, ApprovalBadge } from "@/components/attendance/status-badge";
import { formatIstTime, formatDuration, HALF_DAY_REASON_LABEL, STATUS_LABEL } from "@/lib/attendance-ui";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
} from "date-fns";

interface AdminRecord {
  id: string;
  user: { id: string; name: string; surname: string | null; email: string };
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number | null;
  status: AttendanceStatus | null;
  calculatedStatus: AttendanceStatus | null;
  statusOverride: boolean;
  overrideReason: string | null;
  halfDayReason: HalfDayReason | null;
  adminNote: string | null;
  approvalStatus: AttendanceApproval;
}

const STATUS_FILTER = [
  { value: "", label: "All statuses" },
  { value: "PRESENT", label: "Present" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "ABSENT", label: "Absent" },
];
const APPROVAL_FILTER = [
  { value: "", label: "All approvals" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];
const STATUS_OPTIONS = [
  { value: "PRESENT", label: "Present" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "ABSENT", label: "Absent" },
];
const REASON_OPTIONS = Object.entries(HALF_DAY_REASON_LABEL).map(([value, label]) => ({ value, label }));

const REPORT_PERIODS = [
  { value: "custom", label: "Custom range" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "annually", label: "Annually" },
];

/** The date range for a report preset, relative to today. null = custom (use the manual From/To). */
function periodRange(period: string): { from: string; to: string } | null {
  const now = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  const year = now.getFullYear();
  switch (period) {
    case "weekly":
      return { from: fmt(startOfWeek(now)), to: fmt(endOfWeek(now)) };
    case "monthly":
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) };
    case "quarterly":
      return { from: fmt(startOfQuarter(now)), to: fmt(endOfQuarter(now)) };
    case "half_yearly":
      return now.getMonth() < 6
        ? { from: fmt(new Date(year, 0, 1)), to: fmt(new Date(year, 5, 30)) }
        : { from: fmt(new Date(year, 6, 1)), to: fmt(new Date(year, 11, 31)) };
    case "annually":
      return { from: fmt(startOfYear(now)), to: fmt(endOfYear(now)) };
    default:
      return null;
  }
}

export default function AdminAttendancePage() {
  const toast = useToast();
  const [records, setRecords] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [approval, setApproval] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState("custom");
  const [editing, setEditing] = useState<AdminRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Choosing a report preset fills the date range; editing dates by hand reverts to custom.
  function selectPeriod(next: string) {
    setPeriod(next);
    const range = periodRange(next);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  }

  const queryString = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (status) p.set("status", status);
    if (approval) p.set("approval", approval);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [q, status, approval, from, to]);

  // The export carries the report period so the server titles and names the file.
  const exportUrl = `/api/attendance/export?${queryString()}${period !== "custom" ? `&period=${period}` : ""}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance?${queryString()}`);
      const json = await res.json();
      setRecords(json.records ?? []);
    } catch {
      // keep prior
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce filter changes
    return () => clearTimeout(t);
  }, [load]);

  async function decide(rec: AdminRecord, decision: "APPROVED" | "REJECTED") {
    setBusyId(rec.id);
    try {
      const res = await fetch(`/api/attendance/${rec.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) return toast.error("Couldn't update approval");
      toast.success(decision === "APPROVED" ? "Approved" : "Rejected");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Attendance</h1>
          <p className="text-sm text-muted-foreground">Review, approve, and correct attendance across the team.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={exportUrl}>
            <Button type="button" variant="outline" size="sm">
              <IconFileSpreadsheet className="h-4 w-4" />
              Export CSV
            </Button>
          </a>
          <Link href="/admin/attendance/settings">
            <Button type="button" variant="outline" size="sm">
              <IconSettings className="h-4 w-4" />
              Settings
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="att-q">Search</Label>
            <Input id="att-q" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Report</Label>
            <Dropdown value={period} onChange={selectPeriod} options={REPORT_PERIODS} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Dropdown value={status} onChange={setStatus} options={STATUS_FILTER} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Approval</Label>
            <Dropdown value={approval} onChange={setApproval} options={APPROVAL_FILTER} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="att-range">Date range</Label>
            <DateRangePicker
              id="att-range"
              from={from}
              to={to}
              onChange={(f, t) => {
                setFrom(f);
                setTo(t);
                setPeriod("custom");
              }}
              placeholder="Any"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <EightDotsRotate className="h-9 w-9" />
            </div>
          ) : records.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No attendance records match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Check In</th>
                    <th className="px-4 py-2 font-medium">Check Out</th>
                    <th className="px-4 py-2 font-medium">Duration</th>
                    <th className="px-4 py-2 font-medium">Approval</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0 align-middle">
                      <td className="px-4 py-2">
                        <p className="font-medium">{[r.user.name, r.user.surname].filter(Boolean).join(" ")}</p>
                        <p className="text-xs text-muted-foreground">{r.user.email}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">{r.date}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={r.status} working={!!r.checkIn && !r.checkOut} />
                          {r.statusOverride && (
                            <span
                              className="text-[10px] text-muted-foreground"
                              title={`System calculated ${r.calculatedStatus ? STATUS_LABEL[r.calculatedStatus] : "—"}${r.overrideReason ? ` · ${r.overrideReason}` : ""}`}
                            >
                              (override)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatIstTime(r.checkIn)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatIstTime(r.checkOut)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatDuration(r.workedMinutes)}</td>
                      <td className="px-4 py-2">
                        <ApprovalBadge approval={r.approvalStatus} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {r.approvalStatus !== "APPROVED" && r.status && (
                            <Tooltip label="Approve">
                              <Button type="button" size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => decide(r, "APPROVED")}>
                                <IconCheck className="h-4 w-4 text-emerald-500" />
                              </Button>
                            </Tooltip>
                          )}
                          {r.approvalStatus !== "REJECTED" && r.status && (
                            <Tooltip label="Reject">
                              <Button type="button" size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => decide(r, "REJECTED")}>
                                <IconX className="h-4 w-4 text-red-500" />
                              </Button>
                            </Tooltip>
                          )}
                          <Tooltip label="Override / edit">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(r)}>
                              <IconPencil className="h-3.5 w-3.5" />
                            </Button>
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

      {editing && (
        <OverrideDialog
          record={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function OverrideDialog({
  record,
  onClose,
  onSaved,
}: {
  record: AdminRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<string>(record.status ?? "PRESENT");
  const [halfDayReason, setHalfDayReason] = useState<string>(record.halfDayReason ?? "MANUAL_ADJUSTMENT");
  const [overrideReason, setOverrideReason] = useState(record.overrideReason ?? "");
  const [adminNote, setAdminNote] = useState(record.adminNote ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/attendance/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          halfDayReason: status === "HALF_DAY" ? halfDayReason : null,
          overrideReason: overrideReason.trim() || null,
          adminNote: adminNote.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error("Couldn't save", json.error);
      toast.success("Attendance updated");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override attendance</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {[record.user.name, record.user.surname].filter(Boolean).join(" ")} · {record.date}
              {record.calculatedStatus && (
                <>
                  {" "}
                  · System calculated <span className="font-medium text-foreground">{STATUS_LABEL[record.calculatedStatus]}</span>
                </>
              )}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Dropdown value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            </div>
            {status === "HALF_DAY" && (
              <div className="flex flex-col gap-1.5">
                <Label>Half day reason</Label>
                <Dropdown value={halfDayReason} onChange={setHalfDayReason} options={REASON_OPTIONS} />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ov-reason">Override reason</Label>
              <Input id="ov-reason" placeholder="Why is this being changed?" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ov-note">Admin note</Label>
              <Input id="ov-note" placeholder="Optional" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={save}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
