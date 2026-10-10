"use client";

import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { istDateKey } from "@/lib/attendance";

export type ClientCategory = "CRM" | "WEBSITE" | "WHATSAPP" | "SMM" | "DDQ";

export interface ClientRow {
  id: string;
  name: string;
  category: ClientCategory;
  reason: string | null;
  ownerName: string;
  mobile: string | null;
  email: string | null;
  ownerBirthday: string | null;
  productStart: string | null;
  productEnd: string | null;
  team: { userId: string; name: string; avatarDataUrl: string | null; role: string }[];
}

export const CATEGORIES: { value: ClientCategory; label: string }[] = [
  { value: "CRM", label: "CRM" },
  { value: "WEBSITE", label: "Website" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMM", label: "SMM" },
  { value: "DDQ", label: "DDQ" },
];

export const categoryLabel = (c: string) => CATEGORIES.find((o) => o.value === c)?.label ?? c;

export const fmtKey = (key: string | null) => (key ? format(parseISO(key), "dd MMM yyyy") : "—");

const DAY_MS = 86_400_000;

/** Where a client's product contract stands today (IST). */
export function productStatus(c: Pick<ClientRow, "productStart" | "productEnd">) {
  const today = istDateKey();
  if (c.productEnd) {
    if (c.productEnd < today) return { label: "Expired", variant: "destructive" as const };
    const left = Math.round((parseISO(c.productEnd).getTime() - parseISO(today).getTime()) / DAY_MS);
    if (left <= 30) return { label: left === 0 ? "Ends today" : `Ends in ${left}d`, variant: "warning" as const };
  }
  if (c.productStart && c.productStart > today) return { label: "Not started", variant: "secondary" as const };
  if (!c.productStart && !c.productEnd) return { label: "No dates", variant: "secondary" as const };
  return { label: "Active", variant: "success" as const };
}

export function ProductStatusBadge({ client }: { client: Pick<ClientRow, "productStart" | "productEnd"> }) {
  const s = productStatus(client);
  return <Badge variant={s.variant}>{s.label}</Badge>;
}
