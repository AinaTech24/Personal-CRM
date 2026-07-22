"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { LineChart, type LinePoint } from "@/components/ui/line-chart";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconPlus, IconTrash } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import {
  budgetUsage,
  buildDailySeries,
  dayKey,
  dayKeyToDate,
  formatDuration,
  summariseByPerson,
  summariseTime,
  toHours,
} from "@/lib/project-time";
import type { AssignableUser, ProjectDetail, ProjectTimeEntryItem } from "@/components/projects/types";
import { cn } from "@/lib/utils";

/**
 * The calendar day a picked Date falls on *in the user's timezone*.
 *
 * Deliberately not `toISOString().slice(0,10)`: picking "22 July" in IST would
 * serialise as the 21st, and the entry would land on the wrong day.
 */
function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const RANGES = [
  { value: "all", label: "All time", days: null },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "14", label: "Last 14 days", days: 14 },
  { value: "7", label: "Last 7 days", days: 7 },
] as const;

function Avatar({ src, name }: { src?: string | null; name: string }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-medium text-primary">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

/**
 * One headline number with the rule that produced it.
 *
 * The hint is not decoration: "days" can mean days worked or days elapsed, and
 * a number with no stated definition invites everyone to assume their own.
 */
function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Tooltip label={hint} side="top">
      <div className="flex cursor-help flex-col gap-0.5 rounded-md bg-accent/50 p-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold tabular-nums">{value}</span>
      </div>
    </Tooltip>
  );
}

export function ProjectTimePanel({
  project,
  assignableUsers,
  currentUserId,
  onChanged,
}: {
  project: ProjectDetail;
  assignableUsers: AssignableUser[];
  currentUserId: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const entries = project.timeEntries;

  const [range, setRange] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryUser, setEntryUser] = useState(currentUserId ?? "");
  const [entryDate, setEntryDate] = useState<Date | null>(new Date());
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [description, setDescription] = useState("");
  const [deleting, setDeleting] = useState<ProjectTimeEntryItem | null>(null);

  /** Project-wide figures — never filtered, so "total" always means total. */
  const summary = useMemo(() => summariseTime(entries), [entries]);
  const byPerson = useMemo(() => summariseByPerson(entries), [entries]);
  const budget = budgetUsage(summary.totalMinutes, project.estimatedHours);

  /** Who counts as a supporter, for the role column in the breakdown. */
  const supporterIds = useMemo(() => new Set(project.supporters.map((s) => s.user.id)), [project.supporters]);
  const memberIds = useMemo(() => new Set(project.members.map((m) => m.user.id)), [project.members]);

  const series = useMemo(() => {
    const full = buildDailySeries(entries);
    const window = RANGES.find((r) => r.value === range)?.days;
    if (!window) return full;
    return full.slice(-window);
  }, [entries, range]);

  const rangeMinutes = series.reduce((sum, p) => sum + p.minutes, 0);
  const rangeDaysWorked = series.filter((p) => p.minutes > 0).length;

  const chartPoints: LinePoint[] = series.map((p) => ({
    label: p.date.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    value: toHours(p.minutes),
    detail: p.entries === 0 ? "No time logged" : `${p.entries} ${p.entries === 1 ? "entry" : "entries"}`,
  }));

  // Averaged across days actually worked, matching the "Avg / working day" stat.
  const avgReference =
    rangeDaysWorked > 0
      ? { value: toHours(Math.round(rangeMinutes / rangeDaysWorked)), label: "avg" }
      : null;

  function resetForm() {
    setEntryUser(currentUserId ?? "");
    setEntryDate(new Date());
    setHours("");
    setMinutes("");
    setDescription("");
  }

  async function logTime(e: React.FormEvent) {
    e.preventDefault();
    const totalMinutes = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
    if (!entryUser) return toast.error("Pick who the time is for");
    if (!entryDate) return toast.error("Pick a date");
    if (totalMinutes <= 0) return toast.error("Enter how long was worked");

    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: entryUser,
          workDate: localDayKey(entryDate),
          minutes: totalMinutes,
          description: description.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't log time", data.error);
      toast.success(`Logged ${formatDuration(totalMinutes)}`);
      resetForm();
      setFormOpen(false);
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry(entry: ProjectTimeEntryItem) {
    const res = await fetch(`/api/projects/${project.id}/time/${entry.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't delete entry", data.error);
    toast.success("Time entry deleted");
    await onChanged();
  }

  const userOptions = assignableUsers.map((u) => ({
    value: u.id,
    label: u.surname ? `${u.name} ${u.surname}` : u.name,
    avatarDataUrl: u.avatarDataUrl,
    showAvatar: true,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-base">Time tracking</CardTitle>
          <p className="text-xs text-muted-foreground">
            {summary.entryCount === 0
              ? "No time logged yet"
              : `${summary.entryCount} ${summary.entryCount === 1 ? "entry" : "entries"} from ${summary.contributorCount} ${summary.contributorCount === 1 ? "person" : "people"}`}
          </p>
        </div>
        <Button type="button" size="sm" variant={formOpen ? "outline" : "default"} className="gap-1.5" onClick={() => setFormOpen((v) => !v)}>
          <IconPlus className="h-3.5 w-3.5" />
          {formOpen ? "Cancel" : "Log time"}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {formOpen && (
          <form onSubmit={logTime} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Who</Label>
                <Dropdown
                  value={entryUser}
                  onChange={setEntryUser}
                  placeholder="Select a person"
                  emptyMessage="No users"
                  options={userOptions}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Date worked</Label>
                <DateTimePicker value={entryDate} onChange={setEntryDate} showTime={false} placeholder="Pick a date" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="time-hours">Hours</Label>
                <Input
                  id="time-hours"
                  type="number"
                  min={0}
                  max={24}
                  inputMode="numeric"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="time-minutes">Minutes</Label>
                <Input
                  id="time-minutes"
                  type="number"
                  min={0}
                  max={59}
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="time-description">What was done (optional)</Label>
              <Textarea
                id="time-description"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Reworked the checkout flow after review"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Total: <span className="font-medium text-foreground">{formatDuration((Number(hours) || 0) * 60 + (Number(minutes) || 0))}</span>
              </p>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Saving…" : "Save entry"}
              </Button>
            </div>
          </form>
        )}

        {/* Headline figures. Each carries its own definition on hover. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Total hours"
            value={formatDuration(summary.totalMinutes)}
            hint="Every minute logged against this project, summed across everyone."
          />
          <Stat
            label="Days worked"
            value={String(summary.daysWorked)}
            hint="Calendar days with at least one entry. A day two people both worked counts once."
          />
          <Stat
            label="Days elapsed"
            value={String(summary.elapsedDays)}
            hint={
              summary.firstDay
                ? `Calendar days from ${dayKeyToDate(summary.firstDay).toLocaleDateString()} to ${dayKeyToDate(summary.lastDay!).toLocaleDateString()}, inclusive — idle days included.`
                : "Calendar days from the first logged day to the last, inclusive."
            }
          />
          <Stat
            label="Avg / working day"
            value={formatDuration(summary.avgMinutesPerDay)}
            hint="Total hours ÷ days worked. Days with nothing logged are left out, so this is effort on active days, not an average across the calendar."
          />
          <Stat
            label="Longest streak"
            value={`${summary.longestStreak} ${summary.longestStreak === 1 ? "day" : "days"}`}
            hint="The longest run of back-to-back calendar days that each had time logged."
          />
        </div>

        {budget && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Budget: {formatDuration(summary.totalMinutes)} of {project.estimatedHours}h
              </span>
              <span className={cn("font-medium tabular-nums", budget.over ? "text-destructive" : "text-muted-foreground")}>
                {budget.usedPct}%
                {budget.over
                  ? ` · ${formatDuration(-budget.remainingMinutes)} over`
                  : ` · ${formatDuration(budget.remainingMinutes)} left`}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-accent">
              <div
                className={cn("h-full rounded-full transition-all", budget.over ? "bg-destructive" : "bg-primary")}
                style={{ width: `${Math.min(budget.usedPct, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Hours per day */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">Hours per day</h3>
              <p className="text-xs text-muted-foreground">
                {series.length === 0
                  ? "Log time to see the daily trend"
                  : `${formatDuration(rangeMinutes)} across ${rangeDaysWorked} of ${series.length} days shown`}
              </p>
            </div>
            <Dropdown
              size="sm"
              className="w-36 shrink-0"
              value={range}
              onChange={setRange}
              options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
            />
          </div>
          <LineChart
            points={chartPoints}
            height={220}
            formatValue={(v) => `${v}h`}
            reference={avgReference}
            emptyMessage="No time logged yet"
          />
        </div>

        {/* Per person */}
        {byPerson.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">By person</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="whitespace-nowrap py-2 pr-3 font-medium">Person</th>
                    <th className="whitespace-nowrap py-2 pr-3 font-medium">Role</th>
                    <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Hours</th>
                    <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Days</th>
                    <th className="whitespace-nowrap py-2 pr-3 text-right font-medium">Avg / day</th>
                    <th className="whitespace-nowrap py-2 font-medium">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {byPerson.map((p) => (
                    <tr key={p.user.id} className="border-b border-border/50 last:border-0 hover:bg-primary/5">
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <Avatar src={p.user.avatarDataUrl} name={p.user.name} />
                          <span className="truncate">
                            {p.user.surname ? `${p.user.name} ${p.user.surname}` : p.user.name}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-xs text-muted-foreground">
                        {memberIds.has(p.user.id) ? "Team member" : supporterIds.has(p.user.id) ? "Supporter" : "Contributor"}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{formatDuration(p.minutes)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{p.daysWorked}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                        {formatDuration(Math.round(p.minutes / p.daysWorked))}
                      </td>
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-accent">
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${p.sharePct}%` }} />
                          </span>
                          <span className="text-xs tabular-nums text-muted-foreground">{p.sharePct}%</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border text-xs font-medium">
                    <td className="py-2 pr-3">Total</td>
                    <td />
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                      {formatDuration(summary.totalMinutes)}
                    </td>
                    {/* Deliberately the project's distinct-day count, not the sum of
                        the column above: two people working the same day is one day. */}
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">{summary.daysWorked}</td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right tabular-nums">
                      {formatDuration(summary.avgMinutesPerDay)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Entries */}
        {entries.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Entries</h3>
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 rounded-md bg-accent/50 p-2.5 text-sm hover:bg-primary/5">
                  <span className="flex min-w-0 items-start gap-2">
                    <Avatar src={entry.user.avatarDataUrl} name={entry.user.name} />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span className="font-medium">
                          {entry.user.surname ? `${entry.user.name} ${entry.user.surname}` : entry.user.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {dayKeyToDate(dayKey(entry.workDate)).toLocaleDateString(undefined, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </span>
                      {entry.description && <p className="text-xs text-muted-foreground">{entry.description}</p>}
                      {entry.createdBy.id !== entry.user.id && (
                        <p className="text-[11px] text-muted-foreground">Logged by {entry.createdBy.name}</p>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">{formatDuration(entry.minutes)}</span>
                    <Tooltip label="Delete entry" side="top">
                      <button
                        type="button"
                        onClick={() => setDeleting(entry)}
                        aria-label={`Delete ${formatDuration(entry.minutes)} entry`}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-destructive"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this time entry?"
        description={
          deleting
            ? `${formatDuration(deleting.minutes)} logged by ${deleting.user.name} on ${dayKeyToDate(dayKey(deleting.workDate)).toLocaleDateString()} will be removed from the project's totals.`
            : ""
        }
        onConfirm={async () => {
          if (deleting) await deleteEntry(deleting);
        }}
      />
    </Card>
  );
}
