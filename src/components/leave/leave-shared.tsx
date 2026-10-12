"use client";

import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface LeaveRequestRow {
  id: string;
  category: string;
  startDate: string;
  endDate: string;
  isHalfDay: boolean;
  days: number;
  reason: string;
  status: LeaveStatus;
  appliedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  adminNote: string | null;
  user: { id: string; name: string; avatarDataUrl: string | null; department: string | null };
}

export const CATEGORY_OPTIONS = [
  { value: "CASUAL", label: "Casual" },
  { value: "SICK", label: "Sick" },
  { value: "EARNED", label: "Earned" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "OTHER", label: "Other" },
];

export const categoryLabel = (c: string) => CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;

const STATUS_VARIANT = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "secondary",
} as const;

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

/** "12–13 Oct", "22 Sep", "30 Sep – 2 Oct"; the year is added only when it isn't this one. */
export function leaveDatesLabel(startKey: string, endKey: string) {
  const s = parseISO(startKey);
  const e = parseISO(endKey);
  const yearSuffix = s.getFullYear() === new Date().getFullYear() && e.getFullYear() === s.getFullYear() ? "" : ` ${e.getFullYear()}`;
  if (startKey === endKey) return `${format(s, "d MMM")}${yearSuffix}`;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${format(s, "d")}–${format(e, "d MMM")}${yearSuffix}`;
  }
  return `${format(s, "d MMM")} – ${format(e, "d MMM")}${yearSuffix}`;
}

export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
export const fmtApplied = (iso: string) => format(parseISO(iso), "dd MMM yyyy");
