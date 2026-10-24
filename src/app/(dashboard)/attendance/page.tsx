"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Dropdown } from "@/components/ui/dropdown";
import { IconClock, IconCheck, IconCoffee } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { SummaryCards, type AttendanceSummaryData } from "@/components/attendance/summary-cards";
import { AttendanceLegend } from "@/components/attendance/legend";
import { YearHeatmap, type HeatmapRecord } from "@/components/attendance/year-heatmap";
import { StatusBadge, ApprovalBadge } from "@/components/attendance/status-badge";
import { formatIstTime, formatDuration, formatFullDate, HALF_DAY_REASON_LABEL } from "@/lib/attendance-ui";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";

interface MeResponse {
  year: number;
  todayKey: string;
  records: HeatmapRecord[];
  today: HeatmapRecord | null;
  summary: AttendanceSummaryData;
  holidays: { date: string; name: string }[];
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => ({ value: String(y), label: String(y) }));

export default function AttendancePage() {
  const toast = useToast();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/me?year=${y}`);
      const json = await res.json();
      setData(json);
    } catch {
      // leave prior data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(year);
  }, [year, load]);

  const today = data?.today ?? null;
  const checkedIn = !!today?.checkIn;
  const checkedOut = !!today?.checkOut;
  const onBreak = !!today?.breakIn;

  const ACT_META = {
    "check-in": { success: "Checked in", error: "Couldn't check in", avatar: "/icons/Check-in.svg" },
    "check-out": { success: "Checked out", error: "Couldn't check out", avatar: "/icons/Check-out.svg" },
    "break-in": { success: "Break started", error: "Couldn't start your break", avatar: null },
    "break-out": { success: "Break ended", error: "Couldn't end your break", avatar: null },
  } as const;

  async function act(kind: keyof typeof ACT_META) {
    setActing(true);
    try {
      const res = await fetch(`/api/attendance/${kind}`, { method: "POST" });
      const json = await res.json();
      const meta = ACT_META[kind];
      if (!res.ok) return toast.error(meta.error, json.error);
      toast.toast({
        title: meta.success,
        variant: "success",
        avatarDataUrl: meta.avatar,
        iconAnimate: !!meta.avatar,
      });
      // Viewing the current year is required to see today; jump there if needed.
      if (year !== CURRENT_YEAR) setYear(CURRENT_YEAR);
      else await load(CURRENT_YEAR);
    } finally {
      setActing(false);
    }
  }

  const recent = (data?.records ?? []).filter((r) => r.status || r.checkIn).slice(-30).reverse();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">My Attendance</h1>
          <HelpDialog title="My Attendance — help">
            <HelpSection heading="What this page is for">
              <p>Check in when you start work and check out when you finish — you can also log a break (break-in/break-out), which is subtracted from your worked time. A reminder nudges you around lunchtime if you haven&apos;t taken a break yet.</p>
            </HelpSection>
            <HelpSection heading="The year heatmap">
              <p>Every square is a day — its color shows your status that day (present, late, absent, on leave, holiday, weekend). Switch years with the dropdown above.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="w-28">
          <Dropdown value={String(year)} onChange={(v) => setYear(Number(v))} options={YEAR_OPTIONS} />
        </div>
      </div>

      {/* Today's check-in / check-out */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <IconClock className="h-5 w-5" />
            </div>
            <div>
              {data?.todayKey && <p className="text-sm font-medium">{formatFullDate(data.todayKey)}</p>}
              <p className="text-xs text-muted-foreground">
                {checkedOut
                  ? `Checked out at ${formatIstTime(today?.checkOut)} · ${formatDuration(today?.workedMinutes)}${today?.breakMinutes ? ` (${formatDuration(today.breakMinutes)} break)` : ""}`
                  : onBreak
                    ? `On a break since ${formatIstTime(today?.breakIn)}`
                    : checkedIn
                      ? `Checked in at ${formatIstTime(today?.checkIn)}${today?.breakMinutes ? ` · ${formatDuration(today.breakMinutes)} break so far` : ""}`
                      : "Not checked in yet"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {today?.status ? (
              <StatusBadge status={today.status} />
            ) : (
              checkedIn && !checkedOut && <StatusBadge status={null} working />
            )}
            {!checkedIn && (
              <Button type="button" onClick={() => act("check-in")} disabled={acting}>
                <IconClock className="h-4 w-4" />
                Check In
              </Button>
            )}
            {checkedIn && !checkedOut && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => act(onBreak ? "break-out" : "break-in")}
                  disabled={acting}
                >
                  <IconCoffee className="h-4 w-4" />
                  {onBreak ? "Break Out" : "Break In"}
                </Button>
                <Button type="button" onClick={() => act("check-out")} disabled={acting}>
                  <IconCheck className="h-4 w-4" />
                  Check Out
                </Button>
              </>
            )}
            {checkedOut && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <IconCheck className="h-4 w-4 text-emerald-500" />
                Done for today
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <div className="flex justify-center min-h-[55vh] flex-1 items-center">
          <SkeletonTable rows={8} columns={5} />
        </div>
      ) : data ? (
        <>
          <SummaryCards summary={data.summary} />

          <Card>
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{year} overview</p>
                <AttendanceLegend />
              </div>
              <YearHeatmap year={year} records={data.records} holidays={data.holidays} todayKey={data.todayKey} />
            </CardContent>
          </Card>

          {/* Recent history */}
          <Card>
            <CardContent className="p-0">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium">Recent history</p>
              </div>
              {recent.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No attendance recorded yet this year.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Check In</th>
                        <th className="px-4 py-2 font-medium">Check Out</th>
                        <th className="px-4 py-2 font-medium">Duration</th>
                        <th className="px-4 py-2 font-medium">Break</th>
                        <th className="px-4 py-2 font-medium">Reason</th>
                        <th className="px-4 py-2 font-medium">Approval</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((r) => (
                        <tr key={r.date} className="border-b border-border/50 last:border-0">
                          <td className="whitespace-nowrap px-4 py-2">{formatFullDate(r.date)}</td>
                          <td className="px-4 py-2">
                            <StatusBadge status={r.status} working={!!r.checkIn && !r.checkOut} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatIstTime(r.checkIn)}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatIstTime(r.checkOut)}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatDuration(r.workedMinutes)}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                            {r.breakMinutes ? formatDuration(r.breakMinutes) : "—"}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {r.status === "HALF_DAY" && r.halfDayReason ? HALF_DAY_REASON_LABEL[r.halfDayReason] : "—"}
                          </td>
                          <td className="px-4 py-2">
                            <ApprovalBadge approval={r.approvalStatus} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
