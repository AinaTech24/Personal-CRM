import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { keyFromDate, istDateKey, summarize } from "@/lib/attendance";
import { STATUS_LABEL, APPROVAL_LABEL, HALF_DAY_REASON_LABEL, formatDuration, formatIstTime } from "@/lib/attendance-ui";
import { buildAttendanceWhere } from "@/lib/attendance-query";

/** Maps the report period to a human title and a filename slug. */
const PERIOD_META: Record<string, { title: string; slug: string }> = {
  weekly: { title: "Weekly Attendance Report", slug: "weekly-attendance-report" },
  monthly: { title: "Monthly Attendance Report", slug: "monthly-attendance-report" },
  quarterly: { title: "Quarterly Attendance Report", slug: "quarterly-attendance-report" },
  half_yearly: { title: "Half-Yearly Attendance Report", slug: "half-yearly-attendance-report" },
  annually: { title: "Annual Attendance Report", slug: "annual-attendance-report" },
};

/** Wraps a value for CSV: quotes it and escapes embedded quotes. Guards against formula injection. */
function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  // A leading =/+/-/@ makes spreadsheets execute the cell as a formula.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Admin: CSV export of the filtered attendance, same filters as the list view. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const where = buildAttendanceWhere(req.nextUrl.searchParams);
  const rows = await db.attendance.findMany({
    where,
    include: { user: { select: { name: true, surname: true, email: true } } },
    orderBy: [{ date: "desc" }, { user: { name: "asc" } }],
    take: 5000,
  });

  const params = req.nextUrl.searchParams;
  const period = params.get("period") ?? "";
  const meta = PERIOD_META[period];
  const from = params.get("from");
  const to = params.get("to");
  const summary = summarize(rows);

  // Title + summary block above the data, so the report is self-describing.
  const lines: string[] = [];
  lines.push([meta?.title ?? "Attendance Report"].map(csvCell).join(","));
  if (from || to) lines.push(["Period", `${from ?? "start"} to ${to ?? "today"}`].map(csvCell).join(","));
  lines.push(["Generated", istDateKey()].map(csvCell).join(","));
  lines.push("");
  lines.push(["Present Days", summary.present].map(csvCell).join(","));
  lines.push(["Half Days", summary.halfDay].map(csvCell).join(","));
  lines.push(["Absent Days", summary.absent].map(csvCell).join(","));
  lines.push(["Pending", summary.pending].map(csvCell).join(","));
  lines.push(["Working Days", summary.workingDays].map(csvCell).join(","));
  lines.push(["Attendance %", `${summary.attendancePercent.toFixed(1)}%`].map(csvCell).join(","));
  lines.push("");

  const header = [
    "User",
    "Email",
    "Date",
    "Status",
    "Calculated",
    "Overridden",
    "Approval",
    "Check In",
    "Check Out",
    "Duration",
    "Half Day Reason",
    "Admin Note",
  ];

  lines.push(header.map(csvCell).join(","));
  for (const r of rows) {
    lines.push(
      [
        [r.user.name, r.user.surname].filter(Boolean).join(" "),
        r.user.email,
        keyFromDate(r.date),
        r.status ? STATUS_LABEL[r.status] : "",
        r.calculatedStatus ? STATUS_LABEL[r.calculatedStatus] : "",
        r.statusOverride ? "Yes" : "No",
        APPROVAL_LABEL[r.approvalStatus],
        formatIstTime(r.checkIn?.toISOString()),
        formatIstTime(r.checkOut?.toISOString()),
        formatDuration(r.workedMinutes),
        r.halfDayReason ? HALF_DAY_REASON_LABEL[r.halfDayReason] : "",
        r.adminNote ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }

  const csv = "﻿" + lines.join("\r\n"); // BOM so Excel reads UTF-8
  const slug = meta?.slug ?? "attendance";
  const stamp = from && to ? `${from}_${to}` : istDateKey();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-${stamp}.csv"`,
    },
  });
}
