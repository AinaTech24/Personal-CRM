"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { SkeletonCards } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconChevronLeft, IconTrash } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { ENGAGEMENT_STATUSES, ENGAGEMENT_STATUS_LABEL, LIFECYCLE_STAGES, type EngagementStatus } from "@/lib/consulting";
import { cn } from "@/lib/utils";
import type { ConsultingAccess, Engagement, RegisterItem } from "./types";
import { EngagementStatusBadge, ProgressBar, useConsultingRefresh } from "./shared";
import { OverviewTab } from "./overview-tab";
import { ProfileTab } from "./profile-tab";
import { LifecycleTab } from "./lifecycle-tab";
import { RegistersTab } from "./registers-tab";
import { DiagnosticTab } from "./diagnostic-tab";

type TabKey = "overview" | "profile" | "lifecycle" | "registers" | "diagnostic";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "profile", label: "Profile & qualification" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "registers", label: "Registers" },
  { key: "diagnostic", label: "Diagnostic" },
];

export function EngagementWorkspace({ id, access }: { id: string; access: ConsultingAccess }) {
  const router = useRouter();
  const toast = useToast();
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [items, setItems] = useState<RegisterItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [tab, setTab] = useState<TabKey>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const [eRes, iRes] = await Promise.all([fetch(`/api/consulting/engagements/${id}`), fetch(`/api/consulting/engagements/${id}/items`)]);
      if (eRes.status === 404) return setState("missing");
      if (!eRes.ok || !iRes.ok) return setState("error");
      const [eData, iData] = await Promise.all([eRes.json(), iRes.json()]);
      setEngagement(eData.engagement);
      setItems(iData.items ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);
  useConsultingRefresh(load, id);

  async function patchEngagement(body: Record<string, unknown>, successMessage?: string) {
    const res = await fetch(`/api/consulting/engagements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't save", data.error);
      return false;
    }
    setEngagement((prev) => (prev ? { ...data.engagement, health: prev.health } : data.engagement));
    if (successMessage) toast.success(successMessage);
    return true;
  }

  async function remove() {
    const res = await fetch(`/api/consulting/engagements/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("Couldn't delete the engagement", data.error);
      return;
    }
    toast.success("Engagement deleted");
    router.push("/consulting");
  }

  if (state === "loading") return <SkeletonCards count={4} />;
  if (state === "missing" || state === "error" || !engagement) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {state === "missing" ? "This engagement doesn't exist or was deleted." : "Couldn't load this engagement."}
          </p>
          <Link href="/consulting" className="text-sm text-primary hover:underline">
            Back to all engagements
          </Link>
        </CardContent>
      </Card>
    );
  }

  const stage = LIFECYCLE_STAGES[engagement.currentStage];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link href="/consulting" className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <IconChevronLeft className="h-3.5 w-3.5" />
          All engagements
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold">{engagement.firmName}</h1>
              <EngagementStatusBadge status={engagement.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Stage {stage.stage} · {stage.name} · {Math.round(engagement.progress * 100)}% of lifecycle complete
            </p>
            <ProgressBar value={engagement.progress} className="mt-2 max-w-sm" />
          </div>
          <div className="flex items-center gap-2">
            {access.canUpdate && (
              <div className="w-40">
                <Dropdown
                  value={engagement.status}
                  onChange={(v) => patchEngagement({ status: v as EngagementStatus }, "Status updated")}
                  options={ENGAGEMENT_STATUSES.map((s) => ({ value: s, label: ENGAGEMENT_STATUS_LABEL[s] }))}
                />
              </div>
            )}
            {access.canDelete && (
              <Button type="button" variant="outline" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete engagement">
                <IconTrash className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab engagement={engagement} items={items} onOpenTab={(t) => setTab(t)} />}
      {tab === "profile" && <ProfileTab engagement={engagement} canEdit={access.canUpdate} onSave={patchEngagement} />}
      {tab === "lifecycle" && <LifecycleTab engagement={engagement} canEdit={access.canUpdate} onChanged={load} />}
      {tab === "registers" && <RegistersTab engagementId={id} items={items} access={access} onChanged={load} />}
      {tab === "diagnostic" && <DiagnosticTab engagementId={id} access={access} />}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${engagement.firmName}?`}
        description="This permanently removes the engagement with its lifecycle, every register entry and all diagnostics."
        confirmLabel="Delete engagement"
        onConfirm={remove}
      />
    </div>
  );
}
