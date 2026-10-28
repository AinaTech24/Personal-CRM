"use client";

import { Badge } from "@/components/ui/badge";
import { recencyLabel } from "@/lib/recency";

/** A small age pill next to a record's title — "New" today, "Yesterday", then "N days/weeks/months/years ago". */
export function RecencyBadge({ createdAt, className }: { createdAt: string | Date; className?: string }) {
  const label = recencyLabel(createdAt);
  if (!label) return null;
  return (
    <Badge
      variant={label.isNew ? "success" : "secondary"}
      className={className ? `shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${className}` : "shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide"}
    >
      {label.text}
    </Badge>
  );
}
