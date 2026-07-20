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

  useEffect(() => {
    Promise.all([
      fetch("/api/attendance-settings").then((r) => r.json()),
      fetch("/api/holidays").then((r) => r.json()),
    ])
      .then(([s, h]) => {
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
        setHolidays(h.holidays ?? []);
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
      <div className="flex justify-center py-16">
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
