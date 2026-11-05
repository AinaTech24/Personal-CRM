"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import type { AttendanceStatus, AttendanceApproval, HalfDayReason } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, useDialogState } from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { FilterMenu, type FilterFacet } from "@/components/ui/filter-menu";
import {
  IconFileSpreadsheet,
  IconSettings,
  IconCheck,
  IconX,
  IconPencil,
  IconSearch,
  IconArrowsUpDown,
} from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { StatusBadge, ApprovalBadge } from "@/components/attendance/status-badge";
import { SummaryCards } from "@/components/attendance/summary-cards";
import { AttendanceLegend } from "@/components/attendance/legend";
import { TeamYearHeatmap, type TeamDay } from "@/components/attendance/team-year-heatmap";
import { AttendanceSettingsPanel } from "@/components/attendance/attendance-settings-panel";
import { summarize } from "@/lib/attendance";
import { formatIstTime, formatDuration, HALF_DAY_REASON_LABEL, STATUS_LABEL } from "@/lib/attendance-ui";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { cn } from "@/lib/utils";
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
  breakMinutes: number | null;
  workedMinutes: number | null;
  status: AttendanceStatus | null;
  calculatedStatus: AttendanceStatus | null;
  statusOverride: boolean;
  overrideReason: string | null;
  halfDayReason: HalfDayReason | null;
  adminNote: string | null;
  approvalStatus: AttendanceApproval;
}

const STATUS_OPTIONS = [
  { value: "PRESENT", label: "Present" },
  { value: "HALF_DAY", label: "Half Day" },
  { value: "ABSENT", label: "Absent" },
];
const APPROVAL_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];
const SORT_OPTIONS = [
  { value: "date_desc", label: "Date (newest first)" },
  { value: "date_asc", label: "Date (oldest first)" },
  { value: "name_asc", label: "Employee (A–Z)" },
  { value: "name_desc", label: "Employee (Z–A)" },
];
const REASON_OPTIONS = Object.entries(HALF_DAY_REASON_LABEL).map(([value, label]) => ({ value, label }));

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => ({ value: String(y), label: String(y) }));

interface TeamYearResponse {
  year: number;
  todayKey: string;
  days: TeamDay[];
  holidays: { date: string; name: string }[];
}

const REPORT_PERIODS = [
  { value: "custom", label: "Custom range" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half_yearly", label: "Half-yearly" },
  { value: "annually", label: "Annually" },
];

/** A single icon button that opens a popover of options — same compact control used for sorting elsewhere (e.g. the Social Media clients page). */
function IconOnlyDropdown({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <span>
          <Tooltip label={label}>
            <button
              type="button"
              aria-label={label}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground",
                open && "border-ring/50 text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          </Tooltip>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-primary/5",
                opt.value === value && "bg-accent/60"
              )}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

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
  const [sort, setSort] = useState("date_desc");
  const [editing, setEditing] = useState<AdminRecord | null>(null);
  // Keeps the record around while the dialog animates closed.
  const editingDialog = useDialogState(editing);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [overviewYear, setOverviewYear] = useState(CURRENT_YEAR);
  const [teamYear, setTeamYear] = useState<TeamYearResponse | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // Present / Half / Absent (and the rest) across whatever the filters currently match.
  const summary = useMemo(
    () => summarize(records.map((r) => ({ status: r.status, approvalStatus: r.approvalStatus }))),
    [records]
  );

  // The server already applies status/approval/date/search filters — sorting
  // is purely a client-side presentation choice over whatever page of
  // filtered records came back, so it's cheaper done here than as another
  // round trip.
  const sortedRecords = useMemo(() => {
    const employeeName = (r: AdminRecord) => [r.user.name, r.user.surname].filter(Boolean).join(" ");
    return [...records].sort((a, b) => {
      switch (sort) {
        case "date_asc":
          return a.date.localeCompare(b.date);
        case "name_asc":
          return employeeName(a).localeCompare(employeeName(b));
        case "name_desc":
          return employeeName(b).localeCompare(employeeName(a));
        default:
          return b.date.localeCompare(a.date);
      }
    });
  }, [records, sort]);

  const filterFacets: FilterFacet[] = [
    { key: "status", label: "Status", value: status || null, options: STATUS_OPTIONS, onChange: (v) => setStatus((v as string) ?? "") },
    { key: "approval", label: "Approval", value: approval || null, options: APPROVAL_OPTIONS, onChange: (v) => setApproval((v as string) ?? "") },
  ];

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

  // The year-overview heatmap loads independently of the table filters.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/attendance/team-year?year=${overviewYear}`)
      .then(async (res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json) setTeamYear(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [overviewYear]);

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
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Attendance</h1>
          <HelpDialog title="Attendance — help">
            <HelpSection heading="What this page is for">
              <p>Review everyone&apos;s check-in/check-out and break times, approve or correct a day&apos;s record, and export attendance to CSV.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins">
              <p>See and manage attendance for every department.</p>
            </HelpSection>
            <HelpSection heading="Department Admins">
              <p>See and manage attendance for their own department automatically — no grant needed. A Permission grant (Permissions → Attendance) widens this further, e.g. to every department if a company Admin turned on &quot;All departments&quot; for them.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex items-center gap-2">
          <a href={exportUrl}>
            <Button type="button" variant="outline" size="sm">
              <IconFileSpreadsheet className="h-4 w-4" />
              Export CSV
            </Button>
          </a>
          <Button type="button" variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
            <IconSettings className="h-4 w-4" />
            Settings
          </Button>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Attendance settings</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <AttendanceSettingsPanel />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* Present / Half / Absent totals for the current filter */}
      {!loading && records.length > 0 && <SummaryCards summary={summary} />}

      {/* Team year overview — hover a day to see present / half day / absent counts */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-sm font-medium">{overviewYear} overview</p>
              <div className="w-24">
                <Dropdown
                  value={String(overviewYear)}
                  onChange={(v) => setOverviewYear(Number(v))}
                  options={YEAR_OPTIONS}
                />
              </div>
            </div>
            <AttendanceLegend />
          </div>
          {teamYear ? (
            <TeamYearHeatmap
              year={overviewYear}
              days={teamYear.days}
              holidays={teamYear.holidays}
              todayKey={teamYear.todayKey}
            />
          ) : (
            <div className="flex justify-center min-h-[55vh] flex-1 items-center">
              <SkeletonTable rows={8} columns={6} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendance history — search, sort and filter act on the fixed-height
          table below without needing a separate filters panel above it. */}
      <Card>
        <CardContent className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search by name or email"
                placeholder="Name or email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="w-40">
              <Dropdown size="sm" value={period} onChange={selectPeriod} options={REPORT_PERIODS} />
            </div>
            <div className="w-56">
              <DateRangePicker
                from={from}
                to={to}
                onChange={(f, t) => {
                  setFrom(f);
                  setTo(t);
                  setPeriod("custom");
                }}
                placeholder="Any date"
              />
            </div>
            <IconOnlyDropdown icon={IconArrowsUpDown} label="Sort" value={sort} onChange={setSort} options={SORT_OPTIONS} />
            <FilterMenu facets={filterFacets} />
          </div>
        </CardContent>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center min-h-[55vh] flex-1 items-center">
              <SkeletonTable rows={8} columns={6} />
            </div>
          ) : sortedRecords.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">No attendance records match these filters.</p>
          ) : (
            <div className="max-h-[55vh] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium">Employee</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium">Date</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium">Status</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium">Check In</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium">Check Out</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium">Duration</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium">Break</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium">Approval</th>
                    <th className="sticky top-0 z-10 whitespace-nowrap bg-card px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((r) => (
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
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                        {r.breakMinutes ? formatDuration(r.breakMinutes) : "—"}
                      </td>
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

      {editingDialog.value && (
        <OverrideDialog
          key={editingDialog.value.id}
          open={editingDialog.open}
          record={editingDialog.value}
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
  open,
  record,
  onClose,
  onSaved,
}: {
  open: boolean;
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
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
