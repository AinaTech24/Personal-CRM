import { isToday, isYesterday } from "date-fns";

export type RecencyLabel = "new" | "yesterday" | null;

/**
 * "New" for anything created today, "Yesterday" for anything created the
 * calendar day before, otherwise no label at all. Purely a function of the
 * current date vs. createdAt — nothing is stored or expired, so the badge
 * naturally stops appearing once the date rolls past yesterday.
 */
export function recencyLabel(createdAt: string | Date): RecencyLabel {
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  if (isToday(created)) return "new";
  if (isYesterday(created)) return "yesterday";
  return null;
}
