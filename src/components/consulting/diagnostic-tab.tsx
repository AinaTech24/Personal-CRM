"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SkeletonCards } from "@/components/ui/skeleton";
import { IconChevronDown, IconPlus } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import {
  DEFAULT_OWNER_DEPENDENCY_TARGET,
  FUNCTION_AUDIT,
  OWNER_DEPENDENCY_FUNCTIONS,
  SYSTEMIZATION_CRITERIA,
  SYSTEMIZATION_PROCESSES,
  SYSTEMS_AUDIT,
  groupAverage,
  maturityLevelLabel,
  maturityScorecard,
  ownerDependencyRatio,
  summarizeAssessment,
  systemizationScore,
  type AssessmentData,
  type CheckpointEntry,
  type CheckpointGroup,
} from "@/lib/consulting";
import { cn } from "@/lib/utils";
import type { Assessment, ConsultingAccess } from "./types";
import { Field, ScorePicker, StatTile, formatDateKey, formatPercent, useConsultingRefresh } from "./shared";

const PRIORITY_OPTIONS = [
  { value: "", label: "—" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
];

function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function DiagnosticTab({ engagementId, access }: { engagementId: string; access: ConsultingAccess }) {
  const toast = useToast();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/consulting/engagements/${engagementId}/assessments`);
      if (!res.ok) return;
      const data = await res.json();
      const list: Assessment[] = data.assessments ?? [];
      setAssessments(list);
      setSelectedId((cur) => (cur && list.some((a) => a.id === cur) ? cur : (list[list.length - 1]?.id ?? "")));
    } finally {
      setLoading(false);
    }
  }, [engagementId]);

  useEffect(() => {
    load();
  }, [load]);
  useConsultingRefresh(load, engagementId);

  async function createAssessment() {
    setCreating(true);
    try {
      const label = assessments.length === 0 ? "Baseline diagnostic" : `Re-score ${new Date().getFullYear()}`;
      const res = await fetch(`/api/consulting/engagements/${engagementId}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, assessedOn: istToday() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't start the diagnostic", data.error);
      setAssessments((prev) => [...prev, data.assessment]);
      setSelectedId(data.assessment.id);
      toast.success(
        assessments.length === 0 ? "Diagnostic started" : "Re-score started",
        assessments.length === 0 ? undefined : "Pre-filled from the previous assessment — update what changed."
      );
    } finally {
      setCreating(false);
    }
  }

  const selected = assessments.find((a) => a.id === selectedId) ?? null;

  if (loading) return <SkeletonCards count={3} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {assessments.length > 0 && (
            <div className="w-64">
              <Dropdown
                value={selectedId}
                onChange={setSelectedId}
                options={assessments.map((a) => ({ value: a.id, label: `${a.label} · ${formatDateKey(a.assessedOn)}` }))}
              />
            </div>
          )}
        </div>
        {access.canCreate && (
          <Button type="button" size="sm" onClick={createAssessment} disabled={creating}>
            <IconPlus className="h-3.5 w-3.5" />
            {assessments.length === 0 ? "Start baseline diagnostic" : "New re-score"}
          </Button>
        )}
      </div>

      {!selected ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No diagnostic yet. The baseline scores the MFD across 7 functions and 10 systems, owner dependency and process systemization.
          </CardContent>
        </Card>
      ) : (
        <AssessmentEditor
          key={selected.id}
          assessment={selected}
          access={access}
          onSaved={(a) => setAssessments((prev) => prev.map((x) => (x.id === a.id ? a : x)))}
          onDeleted={() => {
            setAssessments((prev) => prev.filter((x) => x.id !== selected.id));
            setSelectedId("");
            load();
          }}
        />
      )}
    </div>
  );
}

function AssessmentEditor({
  assessment,
  access,
  onSaved,
  onDeleted,
}: {
  assessment: Assessment;
  access: ConsultingAccess;
  onSaved: (a: Assessment) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const canEdit = access.canUpdate;
  const [label, setLabel] = useState(assessment.label);
  const [assessedOn, setAssessedOn] = useState(assessment.assessedOn);
  const [data, setData] = useState<AssessmentData>(assessment.data ?? {});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty =
    label !== assessment.label || assessedOn !== assessment.assessedOn || JSON.stringify(data) !== JSON.stringify(assessment.data ?? {});
  const summary = useMemo(() => summarizeAssessment(data), [data]);
  const scorecard = useMemo(() => maturityScorecard(data), [data]);

  const setCheckpoint = (key: string, patch: Partial<CheckpointEntry>) =>
    setData((d) => ({ ...d, checkpoints: { ...d.checkpoints, [key]: { ...d.checkpoints?.[key], ...patch } } }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/consulting/assessments/${assessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, assessedOn, data }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save the diagnostic", body.error);
      toast.success("Diagnostic saved");
      onSaved(body.assessment);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const res = await fetch(`/api/consulting/assessments/${assessment.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error("Couldn't delete the diagnostic", body.error);
      return;
    }
    toast.success("Diagnostic deleted");
    onDeleted();
  }

  return (
    <div className="flex flex-col gap-5 pb-20">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Field label="Assessment" htmlFor="assess-label">
          <Input id="assess-label" value={label} onChange={(e) => setLabel(e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label="Assessed on">
          {canEdit ? <DatePicker value={assessedOn} onChange={(v) => v && setAssessedOn(v)} clearable={false} /> : <Input value={formatDateKey(assessedOn)} disabled />}
        </Field>
        {access.canDelete && (
          <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Avg maturity / target" value={`${summary.avgMaturity ?? "—"} / ${summary.avgTarget}`} />
        <StatTile label="Maturity level" value={<span className="text-sm">{maturityLevelLabel(summary.avgMaturity)}</span>} />
        <StatTile
          label="Avg owner dependency"
          value={formatPercent(summary.avgOwnerDependency)}
          tone={summary.avgOwnerDependency !== null && summary.avgOwnerDependency > DEFAULT_OWNER_DEPENDENCY_TARGET ? "warning" : undefined}
        />
        <StatTile label="Avg systemization" value={formatPercent(summary.avgSystemization)} />
        <StatTile
          label={`Critical findings · ${summary.scoredCheckpoints}/${summary.totalCheckpoints} scored`}
          value={summary.criticalFindings}
          tone={summary.criticalFindings ? "danger" : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Maturity scorecard</CardTitle>
          <CardDescription>Each area averages its audit checkpoints (1–5). Targets default to 4.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Area</th>
                <th className="px-4 py-2 font-medium">Current</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Gap</th>
                <th className="px-4 py-2 font-medium">Interpretation</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.map((row) => (
                <tr key={row.key} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2 font-medium">{row.label}</td>
                  <td className="px-4 py-2 tabular-nums">{row.current ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      min={1}
                      max={5}
                      step={0.5}
                      value={row.target}
                      disabled={!canEdit}
                      aria-label={`Target for ${row.label}`}
                      className="h-8 w-20"
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n >= 1 && n <= 5) setData((d) => ({ ...d, targets: { ...d.targets, [row.key]: n } }));
                      }}
                    />
                  </td>
                  <td className={cn("px-4 py-2 tabular-nums", (row.gap ?? 0) >= 1.5 && "text-destructive")}>{row.gap ?? "—"}</td>
                  <td className="px-4 py-2 text-muted-foreground">{row.level}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <AuditSection
        title="Seven core functions"
        description="35 checkpoints across Marketing, Sales, Operations, Legal/Compliance, Accounts, HR and Management."
        groups={FUNCTION_AUDIT}
        data={data}
        canEdit={canEdit}
        onChange={setCheckpoint}
      />
      <AuditSection
        title="Ten core systems"
        description="30 checkpoints across the MFD's business systems."
        groups={SYSTEMS_AUDIT}
        data={data}
        canEdit={canEdit}
        onChange={setCheckpoint}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Owner dependency</CardTitle>
          <CardDescription>Critical activities or decisions that still need the owner. Target defaults to 25%.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Function</th>
                <th className="px-4 py-2 font-medium">Activities needing the owner</th>
                <th className="px-4 py-2 font-medium">Critical</th>
                <th className="px-4 py-2 font-medium">Owner-dependent</th>
                <th className="px-4 py-2 font-medium">Dependency</th>
                <th className="px-4 py-2 font-medium">Target %</th>
                <th className="px-4 py-2 font-medium">Reduction actions</th>
              </tr>
            </thead>
            <tbody>
              {OWNER_DEPENDENCY_FUNCTIONS.map((f) => {
                const entry = data.ownerDependency?.[f.key] ?? {};
                const ratio = ownerDependencyRatio(entry);
                const target = entry.target ?? DEFAULT_OWNER_DEPENDENCY_TARGET;
                const update = (patch: Record<string, unknown>) =>
                  setData((d) => ({ ...d, ownerDependency: { ...d.ownerDependency, [f.key]: { ...d.ownerDependency?.[f.key], ...patch } } }));
                const int = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v)) || 0));
                return (
                  <tr key={f.key} className="border-b border-border align-top last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{f.label}</td>
                    <td className="min-w-48 px-4 py-2">
                      <Input value={entry.activities ?? ""} disabled={!canEdit} onChange={(e) => update({ activities: e.target.value })} className="h-8" />
                    </td>
                    <td className="px-4 py-2">
                      <Input type="number" min={0} value={entry.total ?? ""} disabled={!canEdit} onChange={(e) => update({ total: int(e.target.value) })} className="h-8 w-20" aria-label={`Critical activities, ${f.label}`} />
                    </td>
                    <td className="px-4 py-2">
                      <Input type="number" min={0} value={entry.dependent ?? ""} disabled={!canEdit} onChange={(e) => update({ dependent: int(e.target.value) })} className="h-8 w-20" aria-label={`Owner-dependent activities, ${f.label}`} />
                    </td>
                    <td className={cn("px-4 py-2 tabular-nums", ratio !== null && ratio > target && "text-amber-500")}>{formatPercent(ratio)}</td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(target * 100)}
                        disabled={!canEdit}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (Number.isFinite(n) && n >= 0 && n <= 100) update({ target: n / 100 });
                        }}
                        className="h-8 w-20"
                        aria-label={`Target dependency, ${f.label}`}
                      />
                    </td>
                    <td className="min-w-48 px-4 py-2">
                      <Input value={entry.actions ?? ""} disabled={!canEdit} onChange={(e) => update({ actions: e.target.value })} className="h-8" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Process systemization</CardTitle>
          <CardDescription>Each criterion is worth 20%: defined, documented, assigned, measured, automated.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Process</th>
                {SYSTEMIZATION_CRITERIA.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-center font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Next improvement</th>
              </tr>
            </thead>
            <tbody>
              {SYSTEMIZATION_PROCESSES.map((p) => {
                const entry = data.systemization?.[p.key] ?? {};
                const update = (patch: Record<string, unknown>) =>
                  setData((d) => ({ ...d, systemization: { ...d.systemization, [p.key]: { ...d.systemization?.[p.key], ...patch } } }));
                return (
                  <tr key={p.key} className="border-b border-border last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{p.label}</td>
                    {SYSTEMIZATION_CRITERIA.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-center">
                        <Checkbox
                          checked={!!entry[c.key]}
                          onChange={(v) => canEdit && update({ [c.key]: v })}
                          className="mx-auto"
                          aria-label={`${p.label}: ${c.label}`}
                        />
                      </td>
                    ))}
                    <td className="px-4 py-2 tabular-nums">{formatPercent(systemizationScore(entry))}</td>
                    <td className="min-w-48 px-4 py-2">
                      <Input value={entry.next ?? ""} disabled={!canEdit} onChange={(e) => update({ next: e.target.value })} className="h-8" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {canEdit && dirty && (
        <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setLabel(assessment.label);
              setAssessedOn(assessment.assessedOn);
              setData(assessment.data ?? {});
            }}
          >
            Discard changes
          </Button>
          <Button type="button" onClick={save} disabled={saving || !label.trim()}>
            {saving ? "Saving…" : "Save diagnostic"}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${assessment.label}"?`}
        description="This permanently removes every score in this assessment."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  );
}

function AuditSection({
  title,
  description,
  groups,
  data,
  canEdit,
  onChange,
}: {
  title: string;
  description: string;
  groups: CheckpointGroup[];
  data: AssessmentData;
  canEdit: boolean;
  onChange: (key: string, patch: Partial<CheckpointEntry>) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border p-0">
        {groups.map((g) => {
          const open = openGroup === g.key;
          const avg = groupAverage(data, g.key);
          const scored = g.checkpoints.filter((c) => typeof data.checkpoints?.[c.key]?.score === "number").length;
          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => setOpenGroup(open ? null : g.key)}
                aria-expanded={open}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-primary/5"
              >
                <span className="font-medium">{g.label}</span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {scored}/{g.checkpoints.length} scored
                  </span>
                  <span className="tabular-nums text-foreground">{avg === null ? "—" : `Avg ${avg}`}</span>
                  <IconChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
                </span>
              </button>
              {open && (
                <div className="flex flex-col divide-y divide-border bg-muted/20">
                  {g.checkpoints.map((c) => {
                    const entry = data.checkpoints?.[c.key] ?? {};
                    return (
                      <div key={c.key} className="grid grid-cols-1 gap-2 px-4 py-3 lg:grid-cols-[1fr_auto_8rem]">
                        <p className="text-sm">{c.label}</p>
                        <ScorePicker
                          values={[1, 2, 3, 4, 5]}
                          value={entry.score ?? null}
                          disabled={!canEdit}
                          onChange={(v) => onChange(c.key, { score: v })}
                        />
                        <Dropdown
                          value={entry.priority ?? ""}
                          onChange={(v) => onChange(c.key, { priority: v })}
                          options={PRIORITY_OPTIONS}
                          disabled={!canEdit}
                          placeholder="Priority"
                        />
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:col-span-3">
                          <Input
                            value={entry.evidence ?? ""}
                            onChange={(e) => onChange(c.key, { evidence: e.target.value })}
                            placeholder="Evidence / observation"
                            disabled={!canEdit}
                            className="h-8"
                          />
                          <Input
                            value={entry.owner ?? ""}
                            onChange={(e) => onChange(c.key, { owner: e.target.value })}
                            placeholder="Owner"
                            disabled={!canEdit}
                            className="h-8"
                          />
                          <Input
                            value={entry.recommendation ?? ""}
                            onChange={(e) => onChange(c.key, { recommendation: e.target.value })}
                            placeholder="Recommendation"
                            disabled={!canEdit}
                            className="h-8"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
