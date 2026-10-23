"use client";

import { format, parseISO, startOfMonth, startOfYear, subMonths } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils";

export type ExpenseStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID";

export interface ExpenseRow {
  id: string;
  category: string;
  /** Only set (and only meaningful) when category is "OTHER" — what the expense actually was. */
  categoryOther: string | null;
  amount: number;
  expenseDate: string;
  description: string;
  status: ExpenseStatus;
  appliedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  adminNote: string | null;
  paidAt: string | null;
  receiptFileName: string | null;
  receiptFilePath: string | null;
  user: { id: string; name: string; avatarDataUrl: string | null; department: string | null };
}

export const CATEGORY_OPTIONS = [
  { value: "TRAVEL", label: "Travel" },
  { value: "FOOD", label: "Food" },
  { value: "ACCOMMODATION", label: "Accommodation" },
  { value: "OFFICE_SUPPLIES", label: "Office Supplies" },
  { value: "SOFTWARE", label: "Software" },
  { value: "CLIENT_ENTERTAINMENT", label: "Client Entertainment" },
  { value: "OTHER", label: "Other" },
];

export const categoryLabel = (c: string) => CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;

/** "Other — Gym membership" when there's a detail to show, otherwise just the plain category label. */
export function categoryDisplay(row: Pick<ExpenseRow, "category" | "categoryOther">) {
  const label = categoryLabel(row.category);
  return row.category === "OTHER" && row.categoryOther ? `${label} — ${row.categoryOther}` : label;
}

export const PERIOD_OPTIONS = [
  { value: "this-month", label: "This month" },
  { value: "last-3-months", label: "Last 3 months" },
  { value: "last-6-months", label: "Last 6 months" },
  { value: "this-year", label: "This year" },
  { value: "all-time", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/**
 * An inclusive "YYYY-MM-DD" window for a period preset, to filter a row's
 * `expenseDate` key against — lexicographic comparison works fine since
 * both are zero-padded ISO dates. Null means "no filter" (all-time, or an
 * incomplete custom range still being picked).
 */
export function periodWindow(period: string, customFrom: string, customTo: string): { from: string; to: string } | null {
  const today = new Date();
  const todayKey = format(today, "yyyy-MM-dd");
  if (period === "custom") return customFrom && customTo ? { from: customFrom, to: customTo } : null;
  if (period === "this-month") return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: todayKey };
  if (period === "this-year") return { from: format(startOfYear(today), "yyyy-MM-dd"), to: todayKey };
  if (period === "last-3-months") return { from: format(subMonths(today, 3), "yyyy-MM-dd"), to: todayKey };
  if (period === "last-6-months") return { from: format(subMonths(today, 6), "yyyy-MM-dd"), to: todayKey };
  return null; // "all-time"
}

const STATUS_VARIANT = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  PAID: "default",
} as const;

export function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

export const fmtApplied = (iso: string) => format(parseISO(iso), "dd MMM yyyy");
export const fmtExpenseDate = (key: string) => format(parseISO(key), "d MMM yyyy");
export const fmtAmount = (n: number) => formatMoney(n);
