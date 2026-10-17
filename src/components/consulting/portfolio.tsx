"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPlus } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { ENGAGEMENT_STATUSES, ENGAGEMENT_STATUS_LABEL, LIFECYCLE_STAGES, type EngagementStatus } from "@/lib/consulting";
import { cn } from "@/lib/utils";
import type { ConsultingAccess, Engagement } from "./types";
import {
  EngagementStatusBadge,
  Field,
  ProgressBar,
  QualificationBadge,
  StatTile,
  formatDateKey,
  useAssignableUsers,
  useConsultingRefresh,
  userOptions,
} from "./shared";

const STATUS_FILTERS = [
  { value: "", label: "All engagements" },
  ...ENGAGEMENT_STATUSES.map((s) => ({ value: s, label: ENGAGEMENT_STATUS_LABEL[s] })),
];

export function ConsultingPortfolio({ access }: { access: ConsultingAccess }) {
  const router = useRouter();
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/consulting/engagements");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(data.error ?? "Couldn't load engagements");
        return;
      }
      setEngagements(data.engagements ?? []);
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load engagements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useConsultingRefresh(load);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return engagements.filter(
      (e) =>
        (!filter || e.status === filter) &&
        (!q || e.firmName.toLowerCase().includes(q) || (e.city ?? "").toLowerCase().includes(q) || (e.contactPerson ?? "").toLowerCase().includes(q))
    );
  }, [engagements, filter, query]);

  const totals = useMemo(() => {
    const active = engagements.filter((e) => e.status === "ACTIVE");
    return {
      active: active.length,
      prospects: engagements.filter((e) => e.status === "PROSPECT").length,
      overdue: engagements.reduce((n, e) => n + (e.health?.overdueActions ?? 0), 0),
      highRisks: engagements.reduce((n, e) => n + (e.health?.highRisks ?? 0), 0),
    };
  }, [engagements]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">MFD Consulting</h1>
          <p className="text-sm text-muted-foreground">
            Engagements run on the Aina MFD Consulting Kit — qualification to handover.
          </p>
        </div>
        {access.canCreate && (
          <Button type="button" onClick={() => setCreating(true)}>
            <IconPlus className="h-4 w-4" />
            New engagement
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Active engagements" value={totals.active} />
        <StatTile label="Prospects in pipeline" value={totals.prospects} />
        <StatTile label="Overdue actions" value={totals.overdue} tone={totals.overdue > 0 ? "danger" : undefined} />
        <StatTile label="High risks (score ≥ 15)" value={totals.highRisks} tone={totals.highRisks > 0 ? "warning" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search firm, city or contact"
          className="max-w-xs"
          aria-label="Search engagements"
        />
        <div className="w-48">
          <Dropdown value={filter} onChange={setFilter} options={STATUS_FILTERS} />
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={5} columns={7} />
      ) : loadError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-destructive">{loadError}</CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {engagements.length === 0 ? "No consulting engagements yet." : "No engagements match these filters."}
            </p>
            {engagements.length === 0 && access.canCreate && (
              <Button type="button" variant="outline" onClick={() => setCreating(true)}>
                <IconPlus className="h-4 w-4" />
                Qualify your first MFD
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Firm</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Current stage</th>
                  <th className="px-4 py-2.5 font-medium">Qualification</th>
                  <th className="px-4 py-2.5 font-medium">Lead consultant</th>
                  <th className="px-4 py-2.5 font-medium">Actions</th>
                  <th className="px-4 py-2.5 font-medium">Risks</th>
                  <th className="px-4 py-2.5 font-medium">Next meeting</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => {
                  const stage = LIFECYCLE_STAGES[e.currentStage];
                  return (
                    <tr
                      key={e.id}
                      onClick={() => router.push(`/consulting/${e.id}`)}
                      className="cursor-pointer border-b border-border last:border-b-0 hover:bg-primary/5"
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{e.firmName}</p>
                        {(e.city || e.contactPerson) && (
                          <p className="text-xs text-muted-foreground">{[e.contactPerson, e.city].filter(Boolean).join(" · ")}</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <EngagementStatusBadge status={e.status} />
                      </td>
                      <td className="min-w-48 px-4 py-2.5">
                        <p className="whitespace-nowrap text-xs">
                          {stage.stage}. {stage.name}
                        </p>
                        <ProgressBar value={e.progress} className="mt-1.5" />
                      </td>
                      <td className="px-4 py-2.5">
                        <QualificationBadge {...e.qualification} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{e.leadConsultant?.name ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                        {e.health?.openActions ?? 0}
                        {(e.health?.overdueActions ?? 0) > 0 && (
                          <span className="ml-1.5 text-xs text-destructive">{e.health?.overdueActions} overdue</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">
                        {e.health?.openRisks ?? 0}
                        {(e.health?.highRisks ?? 0) > 0 && <span className="ml-1.5 text-xs text-amber-500">{e.health?.highRisks} high</span>}
                      </td>
                      <td className={cn("whitespace-nowrap px-4 py-2.5", !e.health?.nextMeeting && "text-muted-foreground")}>
                        {formatDateKey(e.health?.nextMeeting)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <NewEngagementDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          router.push(`/consulting/${id}`);
        }}
      />
    </div>
  );
}

function NewEngagementDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const users = useAssignableUsers();
  const [firmName, setFirmName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [city, setCity] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadConsultantId, setLeadConsultantId] = useState("");
  const [status, setStatus] = useState<EngagementStatus>("PROSPECT");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFirmName("");
    setContactPerson("");
    setCity("");
    setLeadSource("");
    setLeadConsultantId("");
    setStatus("PROSPECT");
  }, [open]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!firmName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/consulting/engagements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firmName,
          contactPerson,
          city,
          leadSource,
          leadConsultantId: leadConsultantId || null,
          status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't create the engagement", data.error);
      toast.success("Engagement created", "Fill in the profile and score the qualification gate next.");
      onCreated(data.engagement.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <form onSubmit={create} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>New consulting engagement</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label="MFD / firm name" htmlFor="eng-firm">
              <Input id="eng-firm" value={firmName} onChange={(e) => setFirmName(e.target.value)} required autoFocus />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Contact person" htmlFor="eng-contact">
                <Input id="eng-contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
              </Field>
              <Field label="City" htmlFor="eng-city">
                <Input id="eng-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
            </div>
            <Field label="How the lead came" htmlFor="eng-source">
              <Input id="eng-source" value={leadSource} onChange={(e) => setLeadSource(e.target.value)} placeholder="Referral, event, inbound…" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Lead consultant">
                <Dropdown value={leadConsultantId} onChange={setLeadConsultantId} options={userOptions(users)} />
              </Field>
              <Field label="Status">
                <Dropdown
                  value={status}
                  onChange={(v) => setStatus(v as EngagementStatus)}
                  options={ENGAGEMENT_STATUSES.map((s) => ({ value: s, label: ENGAGEMENT_STATUS_LABEL[s] }))}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !firmName.trim()}>
              {saving ? "Creating…" : "Create engagement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
