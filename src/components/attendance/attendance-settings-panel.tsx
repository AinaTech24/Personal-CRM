"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { EightDotsRotate } from "@/components/ui/loader";
import { IconTrash, IconPlus, IconMailCheck } from "@/components/icons";
import { Dropdown } from "@/components/ui/dropdown";
import { useToast } from "@/components/providers/toast-provider";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

interface Shift {
  name: string;
  type: "FULL_DAY" | "HALF_DAY";
  checkInStart: string;
  checkInEnd: string;
  checkOutStart: string;
  checkOutEnd: string;
}

interface LeaveRow {
  id: string;
  date: string;
  type: "FULL_DAY" | "HALF_DAY";
  reason: string | null;
  user: { id: string; name: string; surname: string | null; email: string };
}

interface Holiday {
  id: string;
  date: string;
  name: string;
}

/** The attendance policy + holidays + monthly-report controls, usable on a page or inside a modal. */
export function AttendanceSettingsPanel() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Thresholds are entered in hours (matching the spec's "8 hours"), stored as minutes.
  const [fullDayHours, setFullDayHours] = useState("8");
  const [halfDayHours, setHalfDayHours] = useState("4");
  const [requireApproval, setRequireApproval] = useState(true);
  const [requireHalfDayReason, setRequireHalfDayReason] = useState(false);
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [sendingReports, setSendingReports] = useState(false);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string; email: string }[]>([]);
  const [leaveUserId, setLeaveUserId] = useState("");
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveType, setLeaveType] = useState<"FULL_DAY" | "HALF_DAY">("FULL_DAY");
  const [leaveReason, setLeaveReason] = useState("");
  const [savingLeave, setSavingLeave] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/attendance-settings").then((r) => r.json()),
      fetch("/api/holidays").then((r) => r.json()),
      fetch("/api/leaves").then((r) => r.json()).catch(() => ({ leaves: [] })),
      fetch("/api/users/assignable?scope=all").then((r) => r.json()).catch(() => ({ users: [] })),
    ])
      .then(([s, h, lv, us]) => {
        if (s.settings) {
          setFullDayHours(String(s.settings.fullDayMinutes / 60));
          setHalfDayHours(String(s.settings.halfDayMinutes / 60));
          setRequireApproval(s.settings.requireApproval);
          setRequireHalfDayReason(s.settings.requireHalfDayReason);
          setWorkingDays(
            String(s.settings.workingWeekdays)
              .split(",")
              .map(Number)
              .filter((n) => !Number.isNaN(n))
          );
        }
        setShifts(Array.isArray(s.settings?.shifts) ? s.settings.shifts : []);
        setHolidays(h.holidays ?? []);
        setLeaves(lv.leaves ?? []);
        setStaff(us.users ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleDay(day: number) {
    setWorkingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function save() {
    const full = Math.round(parseFloat(fullDayHours) * 60);
    const half = Math.round(parseFloat(halfDayHours) * 60);
    if (!Number.isFinite(full) || !Number.isFinite(half) || full < 1 || half < 1) {
      return toast.error("Enter valid hours");
    }
    if (half >= full) return toast.error("Half day minimum must be less than full day minimum");
    if (workingDays.length === 0) return toast.error("Select at least one working day");

    setSaving(true);
    try {
      const res = await fetch("/api/attendance-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullDayMinutes: full,
          halfDayMinutes: half,
          requireApproval,
          requireHalfDayReason,
          workingWeekdays: workingDays.join(","),
          shifts,
        }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error("Couldn't save", json.error);
      toast.success("Attendance settings saved");
    } finally {
      setSaving(false);
    }
  }

  async function addHoliday() {
    if (!newDate || !newName.trim()) return toast.error("Enter a date and a name");
    setAddingHoliday(true);
    try {
      const res = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: newDate, name: newName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error("Couldn't add holiday", json.error);
      setHolidays((prev) => [...prev.filter((h) => h.date !== json.holiday.date), json.holiday].sort((a, b) => a.date.localeCompare(b.date)));
      setNewDate("");
      setNewName("");
      toast.success("Holiday added");
    } finally {
      setAddingHoliday(false);
    }
  }

  async function removeHoliday(id: string) {
    const res = await fetch(`/api/holidays/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't remove holiday");
    setHolidays((prev) => prev.filter((h) => h.id !== id));
  }


  function addShift() {
    setShifts((prev) => [
      ...prev,
      {
        name: prev.length ? `Shift ${prev.length + 1}` : "Morning",
        type: "FULL_DAY",
        checkInStart: "09:00",
        checkInEnd: "11:00",
        checkOutStart: "17:00",
        checkOutEnd: "21:00",
      },
    ]);
  }
  function updateShift(i: number, patch: Partial<Shift>) {
    setShifts((prev) => prev.map((s, x) => (x === i ? { ...s, ...patch } : s)));
  }
  function removeShift(i: number) {
    setShifts((prev) => prev.filter((_, x) => x !== i));
  }

  async function addLeave() {
    if (!leaveUserId || !leaveDate) return toast.error("Pick a user and a date");
    setSavingLeave(true);
    try {
      const res = await fetch("/api/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: leaveUserId, date: leaveDate, type: leaveType, reason: leaveReason.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error("Couldn't save leave", json.error);
      setLeaves((prev) => [json.leave, ...prev.filter((l) => l.id !== json.leave.id)]);
      setLeaveDate("");
      setLeaveReason("");
      toast.success(leaveType === "FULL_DAY" ? "Marked on leave (day set to Absent)" : "Half-day leave saved");
    } finally {
      setSavingLeave(false);
    }
  }

  async function removeLeave(id: string) {
    const res = await fetch(`/api/leaves/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't remove leave");
    setLeaves((prev) => prev.filter((l) => l.id !== id));
  }

  async function sendMonthlyReports() {
    setSendingReports(true);
    try {
      const res = await fetch("/api/attendance/send-monthly-reports", { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast.error("Couldn't send reports", json.error);
      toast.success(
        `${json.monthLabel} reports sent`,
        `${json.sent} sent, ${json.skippedNoData} skipped${json.failed ? `, ${json.failed} failed` : ""}`
      );
    } finally {
      setSendingReports(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center min-h-[200px] flex-1 items-center">
        <EightDotsRotate className="h-9 w-9" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-5 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="full-hours">Full day minimum (hours)</Label>
              <Input id="full-hours" type="number" step="0.5" min="1" value={fullDayHours} onChange={(e) => setFullDayHours(e.target.value)} />
              <p className="text-xs text-muted-foreground">Work at or above this counts as a full Present day.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="half-hours">Half day minimum (hours)</Label>
              <Input id="half-hours" type="number" step="0.5" min="1" value={halfDayHours} onChange={(e) => setHalfDayHours(e.target.value)} />
              <p className="text-xs text-muted-foreground">At or above this (but below full) is a Half Day; below is Absent.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Working days</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = workingDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    className={
                      "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                      (on ? "border-primary bg-primary/10 text-foreground" : "border-input text-muted-foreground hover:border-primary/50")
                    }
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Sunday is shown blue on the calendar and is a non-working day unless selected.</p>
          </div>

          <label className="flex items-center gap-2.5">
            <Checkbox checked={requireApproval} onChange={setRequireApproval} aria-label="Require approval" />
            <span className="text-sm">Require admin approval — auto-classified records stay Pending until approved.</span>
          </label>
          <label className="flex items-center gap-2.5">
            <Checkbox checked={requireHalfDayReason} onChange={setRequireHalfDayReason} aria-label="Require half day reason" />
            <span className="text-sm">Require a reason on every Half Day.</span>
          </label>

          <div>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Shifts — allowed check-in / check-out windows */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Check-in / check-out times</p>
              <p className="text-xs text-muted-foreground">
                Define one or more windows for full and half days. Users can only check in during a window they&apos;re
                entitled to. Leave this empty to allow check-in at any time.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addShift}>
              <IconPlus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {shifts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No time windows — check-in is allowed any time.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {shifts.map((s, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-6">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px]">Name</Label>
                    <Input value={s.name} onChange={(e) => updateShift(i, { name: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px]">Type</Label>
                    <Dropdown
                      value={s.type}
                      onChange={(v) => updateShift(i, { type: v as Shift["type"] })}
                      options={[
                        { value: "FULL_DAY", label: "Full day" },
                        { value: "HALF_DAY", label: "Half day" },
                      ]}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px]">Check-in from</Label>
                    <Input type="time" value={s.checkInStart} onChange={(e) => updateShift(i, { checkInStart: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px]">Check-in to</Label>
                    <Input type="time" value={s.checkInEnd} onChange={(e) => updateShift(i, { checkInEnd: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-[11px]">Check-out from</Label>
                    <Input type="time" value={s.checkOutStart} onChange={(e) => updateShift(i, { checkOutStart: e.target.value })} />
                  </div>
                  <div className="flex items-end gap-1">
                    <div className="flex flex-1 flex-col gap-1">
                      <Label className="text-[11px]">Check-out to</Label>
                      <Input type="time" value={s.checkOutEnd} onChange={(e) => updateShift(i, { checkOutEnd: e.target.value })} />
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeShift(i)} aria-label="Remove shift">
                      <IconTrash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Saved with &ldquo;Save settings&rdquo; above.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leave */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-sm font-medium">Leave</p>
            <p className="text-xs text-muted-foreground">
              Full-day leave blocks check-in and marks that day Absent with the reason. Half-day leave lets the user
              check in only during a half-day window.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1.5">
              <Label>User</Label>
              <Dropdown
                value={leaveUserId}
                onChange={setLeaveUserId}
                placeholder="Select user"
                options={staff.map((u) => ({ value: u.id, label: u.name }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Date</Label>
              <DatePicker value={leaveDate} onChange={setLeaveDate} placeholder="Pick a date" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Dropdown
                value={leaveType}
                onChange={(v) => setLeaveType(v as "FULL_DAY" | "HALF_DAY")}
                options={[
                  { value: "FULL_DAY", label: "Full day" },
                  { value: "HALF_DAY", label: "Half day" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reason</Label>
              <Input value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)} placeholder="e.g. Sick leave" />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={addLeave} disabled={savingLeave} className="w-full">
                <IconPlus className="h-4 w-4" />
                {savingLeave ? "Saving…" : "Mark leave"}
              </Button>
            </div>
          </div>

          {leaves.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leave recorded.</p>
          ) : (
            <div className="flex max-h-56 flex-col divide-y divide-border/60 overflow-y-auto rounded-md border border-border">
              {leaves.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="tabular-nums text-muted-foreground">{l.date}</span> ·{" "}
                    {[l.user.name, l.user.surname].filter(Boolean).join(" ")} ·{" "}
                    <span className="text-xs">{l.type === "FULL_DAY" ? "Full day" : "Half day"}</span>
                    {l.reason ? <span className="text-xs text-muted-foreground"> — {l.reason}</span> : null}
                  </span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeLeave(l.id)} aria-label="Remove leave">
                    <IconTrash className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Holidays */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-sm font-medium">Holidays</p>
            <p className="text-xs text-muted-foreground">Non-working days, excluded from working days like Sundays.</p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hol-date">Date</Label>
              <div className="w-44">
                <DatePicker id="hol-date" value={newDate} onChange={setNewDate} placeholder="Pick a date" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hol-name">Name</Label>
              <Input id="hol-name" placeholder="e.g. Independence Day" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-56" />
            </div>
            <Button type="button" size="sm" onClick={addHoliday} disabled={addingHoliday}>
              <IconPlus className="h-4 w-4" />
              Add
            </Button>
          </div>

          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No holidays configured.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border/60 rounded-md border border-border">
              {holidays.map((h) => (
                <div key={h.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    <span className="tabular-nums text-muted-foreground">{h.date}</span> · {h.name}
                  </span>
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeHoliday(h.id)}>
                    <IconTrash className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly email reports */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-sm font-medium">Monthly email reports</p>
            <p className="text-xs text-muted-foreground">
              Each active user gets an emailed attendance snapshot for the month, branded with the company profile.
              Delivery runs automatically each month via a scheduled job; use this to send last month&apos;s reports now.
            </p>
          </div>
          <div>
            <Button type="button" variant="outline" onClick={sendMonthlyReports} disabled={sendingReports}>
              <IconMailCheck className="h-4 w-4" />
              {sendingReports ? "Sending..." : "Send last month's reports now"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
