"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { IconPencil } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import type { LeavePolicyData } from "@/lib/leave";

/** "12 / year", "No monthly cap" — however a single allowance reads, used for both the paid and unpaid rows. */
function allowanceLabel(value: number | null, unit: "month" | "year") {
  if (value === null) return unit === "year" ? "Unlimited" : "No monthly cap";
  return `${value} / ${unit}`;
}

function PolicyRow({ label, takenMonth, takenYear, policy }: {
  label: string;
  takenMonth: number;
  takenYear: number;
  policy: { yearly: number | null; monthly: number | null };
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5 text-sm">
      <span className="font-medium">{label}</span>
      <span className="text-right text-muted-foreground">
        <span className="block">
          This month: <span className="font-medium text-foreground">{takenMonth}</span> taken, {allowanceLabel(policy.monthly, "month")}
        </span>
        <span className="block">
          This year: <span className="font-medium text-foreground">{takenYear}</span> taken, {allowanceLabel(policy.yearly, "year")}
        </span>
      </span>
    </div>
  );
}

interface PolicyFormState {
  paidYearlyAllowance: string;
  paidMonthlyAllowance: string;
  unpaidYearlyAllowance: string;
  unpaidMonthlyAllowance: string;
}

function toFormState(p: LeavePolicyData): PolicyFormState {
  return {
    paidYearlyAllowance: String(p.paidYearlyAllowance),
    paidMonthlyAllowance: p.paidMonthlyAllowance === null ? "" : String(p.paidMonthlyAllowance),
    unpaidYearlyAllowance: p.unpaidYearlyAllowance === null ? "" : String(p.unpaidYearlyAllowance),
    unpaidMonthlyAllowance: p.unpaidMonthlyAllowance === null ? "" : String(p.unpaidMonthlyAllowance),
  };
}

/**
 * The company-wide leave policy — four numbers (paid/unpaid × monthly/yearly
 * cap) an Admin or a Department Admin holding a LEAVE module grant with
 * Update can edit (see /api/leave-policy); a Department User only ever gets
 * the read-only usage-against-policy view, same numbers either way.
 *
 * `usage` is optional: the admin/edit surface (Leave Requests) has no single
 * "whose usage" to show, so it renders just the policy numbers; "My Leave"
 * passes the signed-in user's own month/year totals alongside them.
 */
export function LeavePolicyCard({
  editable = false,
  usage,
}: {
  editable?: boolean;
  usage?: { paidTakenThisMonth: number; paidTakenThisYear: number; unpaidTakenThisMonth: number; unpaidTakenThisYear: number };
}) {
  const toast = useToast();
  const [policy, setPolicy] = useState<LeavePolicyData | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PolicyFormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/leave-policy")
      .then((r) => r.json())
      .then((d) => d.policy && setPolicy(d.policy))
      .catch(() => {});
  }, []);

  function startEditing() {
    if (!policy) return;
    setForm(toFormState(policy));
    setEditing(true);
  }

  async function save() {
    if (!form) return;
    const toIntOrNull = (v: string) => (v.trim() === "" ? null : Number.parseInt(v, 10));
    const body = {
      paidYearlyAllowance: Number.parseInt(form.paidYearlyAllowance, 10) || 0,
      paidMonthlyAllowance: toIntOrNull(form.paidMonthlyAllowance),
      unpaidYearlyAllowance: toIntOrNull(form.unpaidYearlyAllowance),
      unpaidMonthlyAllowance: toIntOrNull(form.unpaidMonthlyAllowance),
    };
    setSaving(true);
    try {
      const res = await fetch("/api/leave-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save the leave policy", data.error);
      setPolicy(data.policy);
      setEditing(false);
      toast.success("Leave policy saved");
    } finally {
      setSaving(false);
    }
  }

  if (!policy) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">Leave policy</p>
            <p className="text-xs text-muted-foreground">
              {usage ? "Your usage against the company allowance." : "The company-wide paid/unpaid allowance."}
            </p>
          </div>
          {editable && !editing && (
            <Tooltip label="Edit leave policy">
              <Button type="button" variant="outline" size="icon" onClick={startEditing} aria-label="Edit leave policy">
                <IconPencil className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          )}
        </div>

        {editing && form ? (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paid-yearly">Paid — yearly</Label>
                <Input
                  id="paid-yearly"
                  type="number"
                  min={0}
                  value={form.paidYearlyAllowance}
                  onChange={(e) => setForm({ ...form, paidYearlyAllowance: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paid-monthly">Paid — monthly cap</Label>
                <Input
                  id="paid-monthly"
                  type="number"
                  min={0}
                  placeholder="No cap"
                  value={form.paidMonthlyAllowance}
                  onChange={(e) => setForm({ ...form, paidMonthlyAllowance: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unpaid-yearly">Unpaid — yearly</Label>
                <Input
                  id="unpaid-yearly"
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  value={form.unpaidYearlyAllowance}
                  onChange={(e) => setForm({ ...form, unpaidYearlyAllowance: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unpaid-monthly">Unpaid — monthly cap</Label>
                <Input
                  id="unpaid-monthly"
                  type="number"
                  min={0}
                  placeholder="No cap"
                  value={form.unpaidMonthlyAllowance}
                  onChange={(e) => setForm({ ...form, unpaidMonthlyAllowance: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={saving} onClick={save}>
                {saving ? "Saving..." : "Save policy"}
              </Button>
            </div>
          </div>
        ) : usage ? (
          <div className="flex flex-col gap-2">
            <PolicyRow
              label="Paid leave"
              takenMonth={usage.paidTakenThisMonth}
              takenYear={usage.paidTakenThisYear}
              policy={{ yearly: policy.paidYearlyAllowance, monthly: policy.paidMonthlyAllowance }}
            />
            <PolicyRow
              label="Unpaid leave"
              takenMonth={usage.unpaidTakenThisMonth}
              takenYear={usage.unpaidTakenThisYear}
              policy={{ yearly: policy.unpaidYearlyAllowance, monthly: policy.unpaidMonthlyAllowance }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Paid — yearly</p>
              <p className="font-medium">{allowanceLabel(policy.paidYearlyAllowance, "year")}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Paid — monthly</p>
              <p className="font-medium">{allowanceLabel(policy.paidMonthlyAllowance, "month")}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Unpaid — yearly</p>
              <p className="font-medium">{allowanceLabel(policy.unpaidYearlyAllowance, "year")}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Unpaid — monthly</p>
              <p className="font-medium">{allowanceLabel(policy.unpaidMonthlyAllowance, "month")}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
