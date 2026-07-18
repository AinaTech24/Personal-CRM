import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { keyFromDate, istDateKey } from "@/lib/attendance";
import { STATUS_LABEL, APPROVAL_LABEL, HALF_DAY_REASON_LABEL, formatDuration, formatIstTime } from "@/lib/attendance-ui";
import { buildAttendanceWhere } from "@/lib/attendance-query";

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

  const lines = [header.map(csvCell).join(",")];
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
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${istDateKey()}.csv"`,
    },
  });
}
