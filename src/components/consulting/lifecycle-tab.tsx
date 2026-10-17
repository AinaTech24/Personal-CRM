"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/dropdown";
import { DatePicker } from "@/components/ui/date-picker";
import { IconChevronDown } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { LIFECYCLE_STAGES, STAGE_STATUSES, STAGE_STATUS_LABEL, type StageStatus } from "@/lib/consulting";
import { cn } from "@/lib/utils";
import type { Engagement, Stage } from "./types";
import { Field, StageStatusBadge, formatDateKey, useAssignableUsers, userOptions } from "./shared";

const STATUS_OPTIONS = STAGE_STATUSES.map((s) => ({ value: s, label: STAGE_STATUS_LABEL[s] }));

export function LifecycleTab({ engagement, canEdit, onChanged }: { engagement: Engagement; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const users = useAssignableUsers();
  const [expanded, setExpanded] = useState<number | null>(null);
  const byStage = new Map(engagement.stages.map((s) => [s.stage, s]));

  async function patch(stage: number, body: Partial<Record<keyof Stage | "ownerId", unknown>>) {
    const res = await fetch(`/api/consulting/engagements/${engagement.id}/stages/${stage}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("Couldn't update the stage", data.error);
    }
    onChanged();
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="w-8 px-3 py-2.5" />
              <th className="px-3 py-2.5 font-medium">Stage</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Owner</th>
              <th className="px-3 py-2.5 font-medium">Planned end</th>
              <th className="px-3 py-2.5 font-medium">Actual end</th>
              <th className="w-24 px-3 py-2.5 font-medium">% done</th>
            </tr>
          </thead>
          <tbody>
            {LIFECYCLE_STAGES.map((def) => {
              const s = byStage.get(def.stage);
              const isCurrent = def.stage === engagement.currentStage;
              const open = expanded === def.stage;
              return (
                <StageRows
                  key={def.stage}
                  def={def}
                  stage={s}
                  isCurrent={isCurrent}
                  open={open}
                  canEdit={canEdit}
                  ownerOptions={userOptions(users)}
                  onToggle={() => setExpanded(open ? null : def.stage)}
                  onPatch={(body) => patch(def.stage, body)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StageRows({
  def,
  stage,
  isCurrent,
  open,
  canEdit,
  ownerOptions,
  onToggle,
  onPatch,
}: {
  def: (typeof LIFECYCLE_STAGES)[number];
  stage: Stage | undefined;
  isCurrent: boolean;
  open: boolean;
  canEdit: boolean;
  ownerOptions: { value: string; label: string }[];
  onToggle: () => void;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const status = stage?.status ?? "NOT_STARTED";
  const [percent, setPercent] = useState(String(stage?.percentComplete ?? 0));
  const [notes, setNotes] = useState(stage?.notes ?? "");
  // Server-side changes (marking Done sets 100%, another consultant's edit)
  // must replace the local input values, not sit behind them.
  useEffect(() => setPercent(String(stage?.percentComplete ?? 0)), [stage?.percentComplete]);
  useEffect(() => setNotes(stage?.notes ?? ""), [stage?.notes]);

  function commitPercent() {
    const n = Math.round(Number(percent));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      setPercent(String(stage?.percentComplete ?? 0));
      return;
    }
    if (n !== stage?.percentComplete) onPatch({ percentComplete: n });
  }

  return (
    <>
      <tr className={cn("border-b border-border align-middle", isCurrent && "bg-primary/5")}>
        <td className="px-3 py-2">
          <button type="button" onClick={onToggle} aria-label={open ? "Collapse stage" : "Expand stage"} aria-expanded={open}>
            <IconChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
          </button>
        </td>
        <td className="min-w-56 px-3 py-2">
          <p className="font-medium">
            {def.stage}. {def.name}
            {isCurrent && <span className="ml-2 text-xs font-normal text-primary">Current</span>}
          </p>
          <p className="text-xs text-muted-foreground">Exit: {def.exitCondition}</p>
        </td>
        <td className="w-40 px-3 py-2">
          {canEdit ? (
            <Dropdown value={status} onChange={(v) => onPatch({ status: v as StageStatus })} options={STATUS_OPTIONS} />
          ) : (
            <StageStatusBadge status={status} />
          )}
        </td>
        <td className="w-44 px-3 py-2">
          {canEdit ? (
            <Dropdown value={stage?.owner?.id ?? ""} onChange={(v) => onPatch({ ownerId: v || null })} options={ownerOptions} />
          ) : (
            <span className="text-muted-foreground">{stage?.owner?.name ?? "—"}</span>
          )}
        </td>
        <td className="w-44 px-3 py-2">
          {canEdit ? (
            <DatePicker value={stage?.plannedEnd ?? ""} onChange={(v) => onPatch({ plannedEnd: v || null })} placeholder="Not set" />
          ) : (
            formatDateKey(stage?.plannedEnd)
          )}
        </td>
        <td className="w-44 px-3 py-2">
          {canEdit ? (
            <DatePicker value={stage?.actualEnd ?? ""} onChange={(v) => onPatch({ actualEnd: v || null })} placeholder="Not set" />
          ) : (
            formatDateKey(stage?.actualEnd)
          )}
        </td>
        <td className="px-3 py-2">
          <Input
            type="number"
            min={0}
            max={100}
            value={percent}
            disabled={!canEdit}
            onChange={(e) => setPercent(e.target.value)}
            onBlur={commitPercent}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label={`Percent complete for ${def.name}`}
            className="h-8 w-20"
          />
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border bg-muted/30">
          <td />
          <td colSpan={6} className="px-3 py-3">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="text-sm md:col-span-1">
                <p className="text-xs font-medium text-muted-foreground">Purpose</p>
                <p className="mt-1">{def.purpose}</p>
              </div>
              <Field label="Planned start">
                {canEdit ? (
                  <DatePicker value={stage?.plannedStart ?? ""} onChange={(v) => onPatch({ plannedStart: v || null })} placeholder="Not set" />
                ) : (
                  <span className="text-sm">{formatDateKey(stage?.plannedStart)}</span>
                )}
              </Field>
              <Field label="Notes" htmlFor={`stage-notes-${def.stage}`}>
                <Textarea
                  id={`stage-notes-${def.stage}`}
                  rows={3}
                  value={notes}
                  disabled={!canEdit}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => notes !== (stage?.notes ?? "") && onPatch({ notes })}
                />
              </Field>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
