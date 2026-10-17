"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CHECKLISTS,
  QUALIFICATION_CRITERIA,
  qualification,
  type ChecklistState,
  type QualificationKey,
  type QualificationScores,
} from "@/lib/consulting";
import type { Engagement } from "./types";
import { Field, QualificationBadge, ScorePicker, useAssignableUsers, userOptions } from "./shared";

const TEXT_FIELDS = [
  "firmName",
  "contactPerson",
  "contactEmail",
  "contactPhone",
  "city",
  "entityType",
  "products",
  "currentTools",
  "leadSource",
  "primaryPainPoint",
  "whyNow",
  "decisionMaker",
  "budgetReadiness",
  "ownerTimeCommitment",
  "preferredStart",
  "executiveSponsor",
  "programOwner",
  "startDate",
  "contractEndDate",
  "weeklyReviewDay",
  "monthlyReviewDay",
  "repositoryLink",
  "primaryGoals",
  "notes",
] as const;

const NUMBER_FIELDS = ["yearsInBusiness", "aumCrore", "monthlySipLakh", "families", "teamSize", "branches"] as const;
const INTEGER_FIELDS = new Set<string>(["yearsInBusiness", "families", "teamSize", "branches"]);

type TextField = (typeof TEXT_FIELDS)[number];
type NumberField = (typeof NUMBER_FIELDS)[number];

interface Draft {
  text: Record<TextField, string>;
  numbers: Record<NumberField, string>;
  scores: QualificationScores;
  leadConsultantId: string;
  checklists: ChecklistState;
}

function toDraft(e: Engagement): Draft {
  return {
    text: Object.fromEntries(TEXT_FIELDS.map((k) => [k, (e[k] as string | null) ?? ""])) as Record<TextField, string>,
    numbers: Object.fromEntries(NUMBER_FIELDS.map((k) => [k, e[k] === null ? "" : String(e[k])])) as Record<NumberField, string>,
    scores: Object.fromEntries(QUALIFICATION_CRITERIA.map((c) => [c.key, e[c.key]])) as QualificationScores,
    leadConsultantId: e.leadConsultant?.id ?? "",
    checklists: e.checklists ?? {},
  };
}

const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => ({ value: d, label: d || "Not set" }));

export function ProfileTab({
  engagement,
  canEdit,
  onSave,
}: {
  engagement: Engagement;
  canEdit: boolean;
  onSave: (body: Record<string, unknown>, successMessage?: string) => Promise<boolean>;
}) {
  const users = useAssignableUsers();
  const [draft, setDraft] = useState<Draft>(() => toDraft(engagement));
  const [saving, setSaving] = useState(false);
  const [numberError, setNumberError] = useState<string | null>(null);

  // A different engagement (navigation) starts from its own saved values.
  useEffect(() => {
    setDraft(toDraft(engagement));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagement.id]);

  const saved = useMemo(() => JSON.stringify(toDraft(engagement)), [engagement]);
  const dirty = JSON.stringify(draft) !== saved;
  const q = qualification(draft.scores);

  const setText = (k: TextField) => (v: string) => setDraft((d) => ({ ...d, text: { ...d.text, [k]: v } }));
  const text = (k: TextField, label: string, opts?: { placeholder?: string; multiline?: boolean; type?: string; className?: string }) => (
    <Field label={label} htmlFor={`p-${k}`} className={opts?.className}>
      {opts?.multiline ? (
        <Textarea id={`p-${k}`} rows={3} value={draft.text[k]} onChange={(e) => setText(k)(e.target.value)} disabled={!canEdit} placeholder={opts.placeholder} />
      ) : (
        <Input id={`p-${k}`} type={opts?.type} value={draft.text[k]} onChange={(e) => setText(k)(e.target.value)} disabled={!canEdit} placeholder={opts?.placeholder} />
      )}
    </Field>
  );
  const date = (k: TextField, label: string) => (
    <Field label={label}>
      {canEdit ? (
        <DatePicker value={draft.text[k]} onChange={setText(k)} placeholder="Not set" />
      ) : (
        <Input value={draft.text[k] || "—"} disabled />
      )}
    </Field>
  );
  const number = (k: NumberField, label: string) => (
    <Field label={label} htmlFor={`p-${k}`}>
      <Input
        id={`p-${k}`}
        type="number"
        min={0}
        step={INTEGER_FIELDS.has(k) ? 1 : "any"}
        value={draft.numbers[k]}
        onChange={(e) => setDraft((d) => ({ ...d, numbers: { ...d.numbers, [k]: e.target.value } }))}
        disabled={!canEdit}
      />
    </Field>
  );

  async function save() {
    const numbers: Record<string, number | null> = {};
    for (const k of NUMBER_FIELDS) {
      const raw = draft.numbers[k].trim();
      if (raw === "") {
        numbers[k] = null;
        continue;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || (INTEGER_FIELDS.has(k) && !Number.isInteger(n))) {
        setNumberError(`Check the value for "${k}" — it must be a ${INTEGER_FIELDS.has(k) ? "whole " : ""}number of 0 or more.`);
        return;
      }
      numbers[k] = n;
    }
    setNumberError(null);
    setSaving(true);
    try {
      await onSave(
        {
          ...draft.text,
          ...numbers,
          ...draft.scores,
          leadConsultantId: draft.leadConsultantId || null,
          checklists: draft.checklists,
        },
        "Profile saved"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-20">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">MFD profile</CardTitle>
          <CardDescription>From the kit&apos;s Consulting Lead Qualification Form and Client Profile.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text("firmName", "MFD / firm name")}
          {text("entityType", "ARN / entity type")}
          {number("yearsInBusiness", "Years in business")}
          {text("contactPerson", "Contact person")}
          {text("contactEmail", "Contact email", { type: "email" })}
          {text("contactPhone", "Contact phone")}
          {text("city", "City")}
          {number("branches", "Branches")}
          {number("teamSize", "Team size")}
          {number("aumCrore", "Approx. AUM (₹ crore)")}
          {number("monthlySipLakh", "Monthly SIP book (₹ lakh)")}
          {number("families", "Families / clients")}
          {text("products", "Products", { multiline: true })}
          {text("currentTools", "Current CRM / software", { multiline: true })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-base">Qualification gate</CardTitle>
            <CardDescription>Score each 0–2. 9–12 strong fit · 6–8 conditional · 0–5 nurture or decline.</CardDescription>
          </div>
          <QualificationBadge {...q} />
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {QUALIFICATION_CRITERIA.map((c) => {
            const value = draft.scores[c.key as QualificationKey];
            return (
              <div key={c.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{value === null ? "Not scored" : c.levels[value]}</p>
                </div>
                <ScorePicker
                  values={[0, 1, 2]}
                  titles={[...c.levels]}
                  value={value}
                  disabled={!canEdit}
                  onChange={(v) => setDraft((d) => ({ ...d, scores: { ...d.scores, [c.key]: v } }))}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Discovery</CardTitle>
          <CardDescription>What the first discovery meeting established.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text("leadSource", "How the lead came")}
          {text("decisionMaker", "Decision maker")}
          {text("primaryPainPoint", "Primary pain point", { multiline: true })}
          {text("whyNow", "Why now", { multiline: true })}
          {text("budgetReadiness", "Budget readiness")}
          {text("ownerTimeCommitment", "Owner time commitment")}
          {date("preferredStart", "Preferred start date")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Governance</CardTitle>
          <CardDescription>Sponsor, program owner, review cadence and the controlled repository.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {text("executiveSponsor", "Executive sponsor (client)")}
          {text("programOwner", "Program owner (client)")}
          <Field label="Aina lead consultant">
            <Dropdown
              value={draft.leadConsultantId}
              onChange={(v) => setDraft((d) => ({ ...d, leadConsultantId: v }))}
              options={userOptions(users)}
              disabled={!canEdit}
            />
          </Field>
          {date("startDate", "Start date")}
          {date("contractEndDate", "Contract end / review date")}
          <Field label="Weekly review day">
            <Dropdown value={draft.text.weeklyReviewDay} onChange={setText("weeklyReviewDay")} options={WEEKDAYS} disabled={!canEdit} />
          </Field>
          {text("monthlyReviewDay", "Monthly review day", { placeholder: "e.g. First Monday" })}
          {text("repositoryLink", "Repository link", { placeholder: "https://…", className: "sm:col-span-2" })}
          {text("primaryGoals", "Primary goals", { multiline: true, className: "sm:col-span-2 lg:col-span-3" })}
          {text("notes", "Notes", { multiline: true, className: "sm:col-span-2 lg:col-span-3" })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {CHECKLISTS.map((def) => (
          <Card key={def.key}>
            <CardHeader>
              <CardTitle className="text-base">{def.label}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {def.items.map((item) => {
                const checked = !!draft.checklists[def.key]?.[item.key];
                return (
                  <label key={item.key} className="flex cursor-pointer items-start gap-2.5 text-sm">
                    <Checkbox
                      checked={checked}
                      className="mt-0.5"
                      onChange={(v) =>
                        canEdit &&
                        setDraft((d) => ({
                          ...d,
                          checklists: { ...d.checklists, [def.key]: { ...(d.checklists[def.key] ?? {}), [item.key]: v } },
                        }))
                      }
                    />
                    <span className={checked ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                  </label>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {canEdit && (dirty || numberError) && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          {numberError && <p className="mr-auto text-sm text-destructive">{numberError}</p>}
          <Button type="button" variant="outline" onClick={() => setDraft(toDraft(engagement))} disabled={saving}>
            Discard changes
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>
      )}
    </div>
  );
}
