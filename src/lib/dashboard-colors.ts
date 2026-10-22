/**
 * Shared chart color palette and status ordering for every dashboard that
 * renders a Chart (src/components/dashboard/charts.tsx) — the admin
 * dashboard's own stat/chart cards, and the per-user dashboard's status
 * breakdowns. Kept in one place so both stay visually consistent and never
 * drift out of sync on what color a given status renders as.
 */
export const HEX = {
  primary: "#dc2626",
  indigo: "#f87171",
  emerald: "#10b981",
  amber: "#f59e0b",
  amberLight: "#fbbf24",
  red: "#ef4444",
  gray: "#9ca3af",
};

export const STATUS_HEX: Record<string, string> = {
  NEW: HEX.primary,
  CONTACTED: HEX.indigo,
  MEETING: HEX.indigo,
  QUALIFIED: HEX.emerald,
  PROPOSAL_SENT: HEX.amber,
  NEGOTIATION: HEX.amberLight,
  WON: HEX.emerald,
  LOST: HEX.red,
  TODO: HEX.gray,
  IN_PROGRESS: HEX.amber,
  REVIEW: HEX.primary,
  COMPLETED: HEX.emerald,
  CANCELLED: HEX.red,
  PLANNED: HEX.gray,
  ACTIVE: HEX.emerald,
  ON_HOLD: HEX.amber,
  DRAFT: HEX.gray,
  SENT: HEX.primary,
  APPROVED: HEX.emerald,
  REJECTED: HEX.red,
  EXPIRED: HEX.amber,
  PAID: HEX.emerald,
  PARTIAL_PAYMENT: HEX.amber,
  OVERDUE: HEX.red,
};

export type DashboardEntityKey = "leads" | "tasks" | "projects" | "quotations" | "invoices";

export const STATUS_ORDER: Record<DashboardEntityKey, string[]> = {
  leads: ["NEW", "CONTACTED", "MEETING", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"],
  tasks: ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"],
  projects: ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"],
  quotations: ["DRAFT", "SENT", "APPROVED", "REJECTED", "EXPIRED"],
  invoices: ["DRAFT", "SENT", "PAID", "PARTIAL_PAYMENT", "OVERDUE", "CANCELLED"],
};

export function statusLabel(status: string) {
  return status.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
