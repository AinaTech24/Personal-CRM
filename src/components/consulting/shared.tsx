"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useSocket } from "@/components/providers/socket-provider";
import { cn } from "@/lib/utils";
import {
  ENGAGEMENT_STATUS_LABEL,
  QUALIFICATION_BAND_LABEL,
  STAGE_STATUS_LABEL,
  type EngagementStatus,
  type QualificationBand,
  type StageStatus,
} from "@/lib/consulting";
import { userLabel, type AssignableUser } from "./types";

/** The active roster, for owner / consultant pickers. Fetched once per mount. */
export function useAssignableUsers() {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/users/assignable?scope=all")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => active && setUsers(d.users ?? []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  return users;
}

export function userOptions(users: AssignableUser[], emptyLabel = "Unassigned") {
  return [{ value: "", label: emptyLabel }, ...users.map((u) => ({ value: u.id, label: userLabel(u) }))];
}

/**
 * Re-runs `reload` whenever any consulting record changes elsewhere — or,
 * given an engagement id, only when that engagement changes — so two
 * consultants working the same client see each other's edits live.
 */
export function useConsultingRefresh(reload: () => void, engagementId?: string) {
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;
    const onChange = (payload: { engagementId?: string }) => {
      if (!engagementId || payload?.engagementId === engagementId) reload();
    };
    socket.on("consulting_changed", onChange);
    return () => {
      socket.off("consulting_changed", onChange);
    };
  }, [socket, reload, engagementId]);
}

export function formatDateKey(key: string | null | undefined) {
  if (!key) return "—";
  try {
    return format(parseISO(key), "d MMM yyyy");
  } catch {
    return key;
  }
}

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
export function formatINR(amount: number | null | undefined) {
  return amount === null || amount === undefined ? "—" : `₹${inr.format(amount)}`;
}

export function formatPercent(ratio: number | null | undefined) {
  return ratio === null || ratio === undefined ? "—" : `${Math.round(ratio * 100)}%`;
}

const ENGAGEMENT_VARIANT: Record<EngagementStatus, "default" | "success" | "warning" | "secondary" | "destructive"> = {
  PROSPECT: "default",
  ACTIVE: "success",
  ON_HOLD: "warning",
  COMPLETED: "secondary",
  DECLINED: "destructive",
};

export function EngagementStatusBadge({ status }: { status: EngagementStatus }) {
  return <Badge variant={ENGAGEMENT_VARIANT[status]}>{ENGAGEMENT_STATUS_LABEL[status]}</Badge>;
}

const STAGE_VARIANT: Record<StageStatus, "default" | "success" | "outline" | "secondary" | "destructive"> = {
  NOT_STARTED: "secondary",
  IN_PROGRESS: "default",
  BLOCKED: "destructive",
  DONE: "success",
  SKIPPED: "outline",
};

export function StageStatusBadge({ status }: { status: StageStatus }) {
  return <Badge variant={STAGE_VARIANT[status]}>{STAGE_STATUS_LABEL[status]}</Badge>;
}

export function QualificationBadge({ band, total, scored }: { band: QualificationBand | null; total: number; scored: number }) {
  if (scored === 0) return <span className="text-xs text-muted-foreground">Not scored</span>;
  const variant = band === "STRONG" ? "success" : band === "CONDITIONAL" ? "warning" : band === "NURTURE" ? "destructive" : "secondary";
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-sm tabular-nums">{total}/12</span>
      <Badge variant={variant}>{band ? QUALIFICATION_BAND_LABEL[band] : `${scored}/6 scored`}</Badge>
    </span>
  );
}

/** Segmented picker for small ordinal scores (qualification 0–2, maturity 1–5). Clicking the active value clears it. */
export function ScorePicker({
  values,
  value,
  onChange,
  disabled,
  titles,
}: {
  values: number[];
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  titles?: string[];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {values.map((v, i) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          title={titles?.[i]}
          aria-pressed={value === v}
          onClick={() => onChange(value === v ? null : v)}
          className={cn(
            "h-8 min-w-8 border-r border-border px-2 text-xs tabular-nums transition-colors last:border-r-0 disabled:cursor-not-allowed disabled:opacity-60",
            value === v ? "bg-primary text-primary-foreground" : "hover:bg-primary/5"
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </div>
  );
}

export function StatTile({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "danger" && "text-destructive", tone === "warning" && "text-amber-500")}>{value}</p>
    </div>
  );
}
