import { db } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { dateFromKey, summarize, type AttendanceSummary } from "@/lib/attendance";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Inclusive date-key range for a calendar month. */
function monthRange(year: number, month0: number): { fromKey: string; toKey: string; label: string } {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const mm = String(month0 + 1).padStart(2, "0");
  return {
    fromKey: `${year}-${mm}-01`,
    toKey: `${year}-${mm}-${String(last).padStart(2, "0")}`,
    label: `${MONTH_NAMES[month0]} ${year}`,
  };
}

/** The calendar month immediately before today (the one a monthly report covers). */
export function previousMonth(now: Date = new Date()): { year: number; month0: number } {
  const y = now.getFullYear();
  const m = now.getMonth();
  return m === 0 ? { year: y - 1, month0: 11 } : { year: y, month0: m - 1 };
}

interface CompanyBrand {
  name: string;
  logoDataUrl: string | null;
}

function summaryRow(label: string, value: string, accent?: string) {
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#555;">${label}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;text-align:right;${accent ? `color:${accent};` : ""}">${value}</td>
  </tr>`;
}

export function monthlyAttendanceEmailHtml(opts: {
  name: string;
  monthLabel: string;
  summary: AttendanceSummary;
  company: CompanyBrand;
}): string {
  const { name, monthLabel, summary, company } = opts;
  const logo = company.logoDataUrl
    ? `<img src="${company.logoDataUrl}" alt="${company.name}" style="max-height:48px;max-width:180px;object-fit:contain;" />`
    : `<div style="font-size:20px;font-weight:700;color:#111;">${company.name || "Aina CRM"}</div>`;

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
    <div style="padding:20px 0;border-bottom:2px solid #dc2626;">${logo}</div>
    <h2 style="margin:24px 0 4px;">Attendance summary — ${monthLabel}</h2>
    <p style="margin:0 0 20px;color:#555;">Hi ${name}, here's your attendance snapshot for ${monthLabel}.</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:8px;overflow:hidden;">
      ${summaryRow("Present Days", String(summary.present), "#059669")}
      ${summaryRow("Half Days", String(summary.halfDay), "#d97706")}
      ${summaryRow("Absent Days", String(summary.absent), "#dc2626")}
      ${summaryRow("Pending", String(summary.pending))}
      ${summaryRow("Working Days", String(summary.workingDays))}
      ${summaryRow("Attendance", `${summary.attendancePercent.toFixed(1)}%`)}
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#999;">
      This is an automated monthly report from ${company.name || "Aina CRM"}. Attendance % counts a half day as 0.5.
    </p>
  </div>`;
}

export interface MonthlyReportResult {
  monthLabel: string;
  sent: number;
  skippedNoData: number;
  failed: number;
}

/**
 * Emails each active user their attendance snapshot for the given month. Users
 * with no finalized attendance that month are skipped (nothing to report).
 * Defaults to the previous calendar month, which is what a month-end run wants.
 */
export async function sendMonthlyReports(year?: number, month0?: number): Promise<MonthlyReportResult> {
  const target = year != null && month0 != null ? { year, month0 } : previousMonth();
  const { fromKey, toKey, label } = monthRange(target.year, target.month0);

  const [company, users] = await Promise.all([
    db.companyProfile.findUnique({ where: { id: "default" } }),
    db.user.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true } }),
  ]);
  const brand: CompanyBrand = { name: company?.name ?? "Aina CRM", logoDataUrl: company?.logoDataUrl ?? null };

  let sent = 0;
  let skippedNoData = 0;
  let failed = 0;

  for (const user of users) {
    const rows = await db.attendance.findMany({
      where: { userId: user.id, date: { gte: dateFromKey(fromKey), lte: dateFromKey(toKey) } },
      select: { status: true, approvalStatus: true },
    });
    const summary = summarize(rows);
    // Nothing finalized and nothing pending — skip rather than send an empty report.
    if (summary.workingDays === 0 && summary.pending === 0) {
      skippedNoData += 1;
      continue;
    }
    try {
      await sendMail({
        to: user.email,
        subject: `Your attendance summary — ${label}`,
        html: monthlyAttendanceEmailHtml({ name: user.name, monthLabel: label, summary, company: brand }),
      });
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { monthLabel: label, sent, skippedNoData, failed };
}
