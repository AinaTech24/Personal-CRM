"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { format, isSameDay, parseISO, startOfWeek, startOfQuarter, subDays } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton, SkeletonForm } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconCheck,
  IconPlus,
  IconTrash,
  IconPencil,
  IconEye,
  IconEyeOff,
  IconCalendar,
} from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { StageStepper } from "@/components/social-media/stage-stepper";
import { FilesTab } from "@/components/social-media/files-tab";
import { stagesFor, stageLabel } from "@/lib/social-content-workflow";
import { adStages, adStageLabel } from "@/lib/social-ad-workflow";
import {
  CALENDAR_WEEKDAYS,
  CALENDAR_WEEKDAY_LABELS,
  calendarSlotKey,
  monthGridDates,
  calendarLabelsFor,
  type CalendarWeekday,
  type CalendarSlotStatus,
  type CalendarSlot,
} from "@/lib/social-calendar";
import { ContentReportsTab } from "@/components/social-media/content-reports-tab";
import { cn } from "@/lib/utils";

const STAGE_OPTIONS = [
  { value: "ENQUIRY", label: "Enquiry" },
  { value: "CALLING", label: "Calling" },
  { value: "MEETING", label: "Meeting" },
  { value: "PLAN_DISCUSSION", label: "Plan Discussion" },
  { value: "APPROVAL", label: "Approval" },
  { value: "ONBOARDED", label: "Onboarded" },
];

const PLATFORM_OPTIONS = [
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "TWITTER", label: "Twitter / X" },
  { value: "YOUTUBE", label: "YouTube" },
];

const CONTENT_TYPE_OPTIONS = [
  { value: "STATIC_POST", label: "Static Post" },
  { value: "CAROUSEL", label: "Carousel" },
  { value: "AI_REEL", label: "AI Reel" },
  { value: "REAL_PERSON_REEL", label: "Real Person Reel" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface ActorRef {
  id: string;
  name: string;
}

/**
 * A checkbox-style multi-select rendered as a dropdown instead of an inline
 * list — used everywhere a piece of content/an ad needs one or more
 * platforms, limited to the ones this client has actually handed over
 * credentials for (nothing to publish to otherwise).
 */
function PlatformMultiSelect({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  const label = value.length
    ? options
        .filter((o) => value.includes(o.value))
        .map((o) => o.label)
        .join(", ")
    : "Select platforms";
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left text-sm transition-colors hover:bg-primary/5"
        >
          <span className={cn("truncate", value.length === 0 && "text-muted-foreground")}>{label}</span>
          <IconChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">No platforms with credentials received yet.</p>
          ) : (
            options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-primary/5"
              >
                {o.label}
                {value.includes(o.value) && <IconCheck className="h-4 w-4 text-primary" />}
              </button>
            ))
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** "Added by X on <date>" / "Edited by Y on <date>" line shown on every card across Platforms/Content/Ads/Reports. */
function AuditLine({
  createdAt,
  createdBy,
  updatedAt,
  updatedBy,
}: {
  createdAt: string;
  createdBy: ActorRef | null;
  updatedAt: string;
  updatedBy: ActorRef | null;
}) {
  const created = format(parseISO(createdAt), "MMM d, yyyy · h:mm a");
  const edited = format(parseISO(updatedAt), "MMM d, yyyy · h:mm a");
  const wasEdited = updatedAt !== createdAt;
  return (
    <p className="text-[11px] text-muted-foreground/80">
      Added by {createdBy?.name ?? "—"} on {created}
      {wasEdited && (
        <>
          {" · "}Edited by {updatedBy?.name ?? createdBy?.name ?? "—"} on {edited}
        </>
      )}
    </p>
  );
}

interface Client {
  id: string;
  name: string;
  companyName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  stage: string;
  planNotes: string | null;
  assignedTo: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  platformAccounts: {
    id: string;
    platform: string;
    handle: string | null;
    credentialsReceived: boolean;
    password: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy: ActorRef | null;
    updatedBy: ActorRef | null;
  }[];
  _count: { contentItems: number; adCampaigns: number; monthlyReports: number; folders: number };
}

type TabKey = "files" | "platforms" | "content" | "ads" | "reports" | "calendar" | "contentReports" | "activity";

/** Lets the parent's single shared "+" button (in the tab bar row) trigger whichever tab is active. */
interface TabCreateHandle {
  openCreate: () => void;
}

/**
 * The pencil/done toggle for a stepper's edit mode. Yellow while editing an
 * in-progress item, red while editing one that's already at its terminal
 * stage (Published/Completed) — a visual "careful, this one's finished"
 * signal, not just a plain color-neutral pencil.
 */
function StageEditToggle({
  isEditing,
  isTerminal,
  itemLabel,
  onToggle,
}: {
  isEditing: boolean;
  isTerminal: boolean;
  itemLabel: string;
  onToggle: () => void;
}) {
  return (
    <Tooltip label={isEditing ? "Done" : "Edit stage (undo)"}>
      <button
        type="button"
        aria-label={isEditing ? `Done editing ${itemLabel}` : `Edit ${itemLabel} stage`}
        onClick={onToggle}
        className={cn(
          "text-muted-foreground hover:text-foreground",
          isEditing && (isTerminal ? "text-red-500" : "text-amber-500")
        )}
      >
        {isEditing ? <IconCheck className="h-4 w-4" /> : <IconPencil className="h-4 w-4" />}
      </button>
    </Tooltip>
  );
}

/**
 * Shaped like the real page below it (back-link, header card, tab bar, a
 * handful of record cards) rather than a generic centered form — the
 * previous skeleton (SkeletonForm) bore no resemblance to this layout at
 * all, so the page visibly jumped the moment the real data arrived.
 */
function ClientDetailSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <Skeleton className="h-4 w-28" />

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-8 w-16" />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4">
          {["Platforms", "Content", "Ads", "Monthly Reports", "Content Calendar", "Activity"].map((label) => (
            <Skeleton key={label} className="h-5 w-20" />
          ))}
        </div>
        <Skeleton className="mb-1.5 h-9 w-9 shrink-0 rounded-md" />
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center justify-between gap-4 p-3.5">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
              <Skeleton className="h-4 w-4 shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function SocialClientDetailView({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>("platforms");
  const [editOpen, setEditOpen] = useState(false);
  const filesRef = useRef<TabCreateHandle>(null);
  const platformsRef = useRef<TabCreateHandle>(null);
  const contentRef = useRef<TabCreateHandle>(null);
  const adsRef = useRef<TabCreateHandle>(null);
  const reportsRef = useRef<TabCreateHandle>(null);
  const createHandleForTab: Partial<Record<TabKey, React.RefObject<TabCreateHandle | null>>> = {
    files: filesRef,
    platforms: platformsRef,
    content: contentRef,
    ads: adsRef,
    reports: reportsRef,
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/social/clients/${clientId}`);
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      const data = await res.json();
      setClient(data.client);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (loading) {
    return <ClientDetailSkeleton />;
  }
  if (notFound || !client) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">Client not found.</CardContent>
        </Card>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "files", label: "Files", count: client._count.folders },
    { key: "platforms", label: "Platforms", count: client.platformAccounts.length },
    { key: "content", label: "Content", count: client._count.contentItems },
    { key: "ads", label: "Ads", count: client._count.adCampaigns },
    { key: "reports", label: "Monthly Reports", count: client._count.monthlyReports },
    { key: "calendar", label: "Content Calendar" },
    { key: "contentReports", label: "Content Reports" },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <BackLink />

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{client.name}</h1>
              <Badge>{stageLabel2(client.stage)}</Badge>
            </div>
            {client.companyName && <p className="text-sm text-muted-foreground">{client.companyName}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {client.contactPerson && `${client.contactPerson} · `}
              {client.phone && `${client.phone} · `}
              {client.email || ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Assigned to {client.assignedTo?.name ?? "no one"} · Created by {client.createdBy.name}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm transition-colors",
                tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="ml-1 text-xs tabular-nums text-muted-foreground">({t.count})</span>}
            </button>
          ))}
        </div>
        {createHandleForTab[tab] && (
          <Tooltip label="New">
            <Button size="icon" aria-label="New" className="mb-1.5 shrink-0" onClick={() => createHandleForTab[tab]?.current?.openCreate()}>
              <IconPlus className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>

      {tab === "files" && <FilesTab ref={filesRef} clientId={client.id} onChanged={load} />}
      {tab === "platforms" && <PlatformsTab ref={platformsRef} clientId={client.id} accounts={client.platformAccounts} onChanged={load} />}
      {tab === "content" && <ContentTab ref={contentRef} clientId={client.id} platformAccounts={client.platformAccounts} />}
      {tab === "ads" && <AdsTab ref={adsRef} clientId={client.id} onChanged={load} platformAccounts={client.platformAccounts} />}
      {tab === "reports" && <ReportsTab ref={reportsRef} clientId={client.id} onChanged={load} />}
      {tab === "calendar" && <CalendarTab clientId={client.id} />}
      {tab === "contentReports" && <ContentReportsTab clientId={client.id} clientName={client.name} />}
      {tab === "activity" && <ActivityTab clientId={client.id} />}

      <EditClientDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        client={client}
        onSaved={() => {
          setEditOpen(false);
          load();
        }}
      />
    </div>
  );
}

function stageLabel2(stage: string) {
  return STAGE_OPTIONS.find((s) => s.value === stage)?.label ?? stage;
}

/**
 * Points back at whichever list view the viewer actually has: "Clients" for
 * a Social Media team member (regular or lead), "Social Media" for a
 * company admin — the admin-facing table page doesn't exist in their nav at
 * all, so linking there would dead-end on a page they'd never navigate to.
 */
function BackLink() {
  const [restricted, setRestricted] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        const role = d.user?.role;
        const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
        setRestricted(!isAdmin && !!d.user?.socialMedia?.hasAccess);
      })
      .catch(() => {
        if (active) setRestricted(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const href = restricted ? "/clients" : "/social-media";
  const label = restricted ? "Back to Clients" : "Back to Social Media";

  return (
    <Link href={href} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <IconChevronLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

function EditClientDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(client.name);
  const [companyName, setCompanyName] = useState(client.companyName ?? "");
  const [contactPerson, setContactPerson] = useState(client.contactPerson ?? "");
  const [phone, setPhone] = useState(client.phone ?? "");
  const [email, setEmail] = useState(client.email ?? "");
  const [stage, setStage] = useState(client.stage);
  const [planNotes, setPlanNotes] = useState(client.planNotes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(client.name);
    setCompanyName(client.companyName ?? "");
    setContactPerson(client.contactPerson ?? "");
    setPhone(client.phone ?? "");
    setEmail(client.email ?? "");
    setStage(client.stage);
    setPlanNotes(client.planNotes ?? "");
  }, [open, client]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/social/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, companyName: companyName || null, contactPerson: contactPerson || null, phone: phone || null, email: email || null, stage, planNotes: planNotes || null }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save", data.error);
      toast.success("Client updated");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {client.name}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form id="edit-social-client" onSubmit={save} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-sm-name">Name</Label>
              <Input id="edit-sm-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-sm-company">Company</Label>
              <Input id="edit-sm-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-sm-contact">Contact person</Label>
                <Input id="edit-sm-contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-sm-phone">Phone</Label>
                <Input id="edit-sm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-sm-email">Email</Label>
              <Input id="edit-sm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-sm-stage">Onboarding stage</Label>
              <Dropdown id="edit-sm-stage" value={stage} onChange={setStage} options={STAGE_OPTIONS} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-sm-notes">Plan notes</Label>
              <Textarea id="edit-sm-notes" value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} rows={3} />
            </div>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="submit" form="edit-social-client" disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Platforms ----------

const PlatformsTab = forwardRef<TabCreateHandle, {
  clientId: string;
  accounts: Client["platformAccounts"];
  onChanged: () => void;
}>(function PlatformsTab({ clientId, accounts, onChanged }, ref) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState("FACEBOOK");
  const [handle, setHandle] = useState("");
  const [received, setReceived] = useState(false);
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client["platformAccounts"][number] | null>(null);

  function openFor(existing?: Client["platformAccounts"][number]) {
    setPlatform(existing?.platform ?? "FACEBOOK");
    setHandle(existing?.handle ?? "");
    setReceived(existing?.credentialsReceived ?? false);
    setNotes(existing?.notes ?? "");
    setPassword(existing?.password ?? "");
    setShowPassword(false);
    setOpen(true);
  }

  useImperativeHandle(ref, () => ({ openCreate: () => openFor() }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/social/clients/${clientId}/platforms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, handle: handle || null, credentialsReceived: received, notes: notes || null, password }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save platform", data.error);
      setOpen(false);
      toast.success("Platform saved");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/social/clients/${clientId}/platforms/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't remove platform");
    toast.success("Platform removed");
    setDeleteTarget(null);
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {accounts.map((a) => (
          <Card key={a.id} className="w-64 shrink-0 cursor-pointer" onClick={() => openFor(a)}>
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{PLATFORM_OPTIONS.find((p) => p.value === a.platform)?.label ?? a.platform}</p>
                <button
                  type="button"
                  aria-label={`Remove ${a.platform}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(a);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">{a.handle || "No handle on file"}</p>
              <Badge variant={a.credentialsReceived ? "success" : "secondary"} className="w-fit">
                {a.credentialsReceived ? "Credentials received" : "Awaiting credentials"}
              </Badge>
              <AuditLine createdAt={a.createdAt} createdBy={a.createdBy} updatedAt={a.updatedAt} updatedBy={a.updatedBy} />
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No platforms added yet.</p>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Platform account</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="platform-form" onSubmit={save} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="platform-select">Platform</Label>
                <Dropdown id="platform-select" value={platform} onChange={setPlatform} options={PLATFORM_OPTIONS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="platform-handle">Handle / username</Label>
                <Input id="platform-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="platform-password">Password</Label>
                <div className="relative">
                  <Input
                    id="platform-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="off"
                    className="pr-9"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={received} onChange={setReceived} aria-label="Login credentials received from client" />
                Login credentials received from client
              </label>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="platform-notes">Notes</Label>
                <Textarea id="platform-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="platform-form" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Remove ${deleteTarget ? PLATFORM_OPTIONS.find((p) => p.value === deleteTarget.platform)?.label ?? deleteTarget.platform : ""}?`}
        description="This permanently removes the platform account, including its saved password and notes. This cannot be undone."
        onConfirm={confirmRemove}
      />
    </div>
  );
});

// ---------- Content ----------

interface ContentItem {
  id: string;
  type: string;
  title: string;
  caption: string | null;
  hashtags: string | null;
  stage: string;
  platforms: string;
  scheduledFor: string | null;
  createdAt: string;
  createdBy: ActorRef;
  updatedAt: string;
  updatedBy: ActorRef | null;
}

const ContentTab = forwardRef<TabCreateHandle, { clientId: string; platformAccounts: Client["platformAccounts"] }>(function ContentTab(
  { clientId, platformAccounts },
  ref
) {
  const toast = useToast();
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const credentialedPlatforms = useMemo(
    () =>
      platformAccounts
        .filter((a) => a.credentialsReceived)
        .map((a) => PLATFORM_OPTIONS.find((p) => p.value === a.platform) ?? { value: a.platform, label: a.platform }),
    [platformAccounts]
  );
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("STATIC_POST");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [saving, setSaving] = useState(false);
  /** Which item's stepper is unlocked for undo — past stages become clickable while set. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);

  async function load() {
    const res = await fetch(`/api/social/clients/${clientId}/content`);
    if (res.ok) setItems((await res.json()).content);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function openCreate() {
    setType("STATIC_POST");
    setTitle("");
    setCaption("");
    setHashtags("");
    setPlatforms([]);
    setScheduledFor("");
    setOpen(true);
  }

  useImperativeHandle(ref, () => ({ openCreate }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (platforms.length === 0) return toast.error("Pick at least one platform");
    setSaving(true);
    try {
      const res = await fetch(`/api/social/clients/${clientId}/content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, title, caption: caption || null, hashtags: hashtags || null, platforms, scheduledFor: scheduledFor || null }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't create content", data.error);
      setOpen(false);
      toast.success("Content created");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function transition(item: ContentItem, toStage: string) {
    const res = await fetch(`/api/social/content/${item.id}/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStage }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error("Couldn't move stage", data.error);
    toast.success(toStage === "CANCELLED" ? "Content cancelled" : `Moved to ${stageLabel(item.type as never, toStage as never)}`);
    load();
  }

  async function confirmRemove() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/social/content/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete content");
    toast.success("Content deleted");
    setDeleteTarget(null);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      {items === null ? (
        <SkeletonForm fields={4} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No content yet for this client.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const sequence = stagesFor(item.type as never);
            const isCancelled = item.stage === "CANCELLED";
            const isEditing = editingId === item.id;
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-col gap-2 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-medium">
                        {item.title}
                        <Badge variant="secondary">{CONTENT_TYPE_OPTIONS.find((t) => t.value === item.type)?.label}</Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.platforms.split(",").map((p) => PLATFORM_OPTIONS.find((o) => o.value === p)?.label ?? p).join(", ")}
                        {item.scheduledFor && ` · Scheduled ${format(parseISO(item.scheduledFor), "MMM d, yyyy · h:mm a")}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StageEditToggle
                        isEditing={isEditing}
                        isTerminal={item.stage === "PUBLISHED"}
                        itemLabel={item.title}
                        onToggle={() => setEditingId((id) => (id === item.id ? null : item.id))}
                      />
                      <button type="button" aria-label={`Delete ${item.title}`} onClick={() => setDeleteTarget(item)} className="text-muted-foreground hover:text-destructive">
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* One row: the whole workflow as a stepper (done/current/upcoming),
                      not a separate "Move to" button plus a redundant static sequence line.
                      Toggling edit mode unlocks past stages so you can undo back to one. */}
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
                    <StageStepper
                      sequence={sequence}
                      currentStage={item.stage}
                      isCancelled={isCancelled}
                      isEditing={isEditing}
                      labelFor={(s) => stageLabel(item.type as never, s as never)}
                      onTransition={(s) => transition(item, s)}
                    />
                    {!isCancelled && item.stage !== "PUBLISHED" && (
                      <button
                        type="button"
                        onClick={() => transition(item, "CANCELLED")}
                        className="ml-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <AuditLine createdAt={item.createdAt} createdBy={item.createdBy} updatedAt={item.updatedAt} updatedBy={item.updatedBy} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New content</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="content-form" onSubmit={create} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="content-type">Type</Label>
                <Dropdown id="content-type" value={type} onChange={setType} options={CONTENT_TYPE_OPTIONS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="content-title">Title</Label>
                <Input id="content-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="content-caption">Caption</Label>
                <Textarea id="content-caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="content-hashtags">Hashtags</Label>
                <Input id="content-hashtags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#ainatech #socialmedia" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Platforms</Label>
                <PlatformMultiSelect options={credentialedPlatforms} value={platforms} onChange={setPlatforms} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="content-scheduled">Scheduled for</Label>
                <DateTimePicker
                  id="content-scheduled"
                  value={scheduledFor ? parseISO(scheduledFor) : null}
                  onChange={(d) => setScheduledFor(d.toISOString())}
                  placeholder="Pick a date & time"
                />
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="content-form" disabled={saving}>
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This permanently deletes the content item along with its approval history. This cannot be undone."
        onConfirm={confirmRemove}
      />
    </div>
  );
});

// ---------- Ads ----------

interface AdCampaign {
  id: string;
  name: string;
  objective: string;
  platforms: string | null;
  stage: string;
  budget: string | number | null;
  reach: number | null;
  leadsGenerated: number | null;
  createdAt: string;
  createdBy: ActorRef;
  updatedAt: string;
  updatedBy: ActorRef | null;
}

const AdsTab = forwardRef<
  TabCreateHandle,
  { clientId: string; onChanged: () => void; platformAccounts: Client["platformAccounts"] }
>(function AdsTab({ clientId, onChanged, platformAccounts }, ref) {
  const toast = useToast();
  const [ads, setAds] = useState<AdCampaign[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("LEADS");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [budget, setBudget] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  /** Which campaign's stepper is unlocked for undo — past stages become clickable while set. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdCampaign | null>(null);
  const credentialedPlatforms = useMemo(
    () =>
      platformAccounts
        .filter((a) => a.credentialsReceived)
        .map((a) => PLATFORM_OPTIONS.find((p) => p.value === a.platform) ?? { value: a.platform, label: a.platform }),
    [platformAccounts]
  );

  async function load() {
    const res = await fetch(`/api/social/clients/${clientId}/ads`);
    if (res.ok) setAds((await res.json()).ads);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function openCreate() {
    setName("");
    setObjective("LEADS");
    setPlatforms([]);
    setBudget("");
    setDurationDays("");
    setTargetAudience("");
    setLocation("");
    setOpen(true);
  }

  useImperativeHandle(ref, () => ({ openCreate }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (platforms.length === 0) return toast.error("Pick at least one platform");
    setSaving(true);
    try {
      const res = await fetch(`/api/social/clients/${clientId}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          objective,
          platforms,
          budget: budget ? Number(budget) : null,
          durationDays: durationDays ? Number(durationDays) : null,
          targetAudience: targetAudience || null,
          location: location || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't create campaign", data.error);
      setOpen(false);
      toast.success("Campaign created");
      load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function transitionAd(ad: AdCampaign, stage: string) {
    const res = await fetch(`/api/social/ads/${ad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    const data = await res.json();
    if (!res.ok) return toast.error("Couldn't move stage", data.error);
    toast.success(stage === "CANCELLED" ? "Campaign cancelled" : `Moved to ${adStageLabel(stage as never)}`);
    load();
  }

  async function confirmRemove() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/social/ads/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete campaign");
    toast.success("Campaign deleted");
    setDeleteTarget(null);
    load();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      {ads === null ? (
        <SkeletonForm fields={3} />
      ) : ads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No ad campaigns yet.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {ads.map((ad) => {
            const sequence = adStages();
            const isCancelled = ad.stage === "CANCELLED";
            const isEditing = editingId === ad.id;
            return (
              <Card key={ad.id}>
                <CardContent className="flex flex-col gap-2 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{ad.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ad.platforms && `${ad.platforms.split(",").map((p) => PLATFORM_OPTIONS.find((o) => o.value === p)?.label ?? p).join(", ")} · `}
                        Objective: {ad.objective} {ad.budget != null && `· Budget ₹${ad.budget}`}
                        {ad.reach != null && ` · Reach ${ad.reach}`}
                        {ad.leadsGenerated != null && ` · Leads ${ad.leadsGenerated}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StageEditToggle
                        isEditing={isEditing}
                        isTerminal={ad.stage === "COMPLETED"}
                        itemLabel={ad.name}
                        onToggle={() => setEditingId((id) => (id === ad.id ? null : ad.id))}
                      />
                      <button type="button" aria-label={`Delete ${ad.name}`} onClick={() => setDeleteTarget(ad)} className="text-muted-foreground hover:text-destructive">
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
                    <StageStepper
                      sequence={sequence}
                      currentStage={ad.stage}
                      isCancelled={isCancelled}
                      isEditing={isEditing}
                      labelFor={(s) => adStageLabel(s as never)}
                      onTransition={(s) => transitionAd(ad, s)}
                    />
                    {!isCancelled && ad.stage !== "COMPLETED" && (
                      <button
                        type="button"
                        onClick={() => transitionAd(ad, "CANCELLED")}
                        className="ml-1 text-xs text-muted-foreground hover:text-destructive"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <AuditLine createdAt={ad.createdAt} createdBy={ad.createdBy} updatedAt={ad.updatedAt} updatedBy={ad.updatedBy} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New ad campaign</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="ad-form" onSubmit={create} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ad-name">Name</Label>
                <Input id="ad-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ad-objective">Objective</Label>
                <Dropdown
                  id="ad-objective"
                  value={objective}
                  onChange={setObjective}
                  options={[
                    { value: "LEADS", label: "Leads" },
                    { value: "REACH", label: "Reach" },
                    { value: "FOLLOWERS", label: "Followers" },
                  ]}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Platforms</Label>
                <PlatformMultiSelect options={credentialedPlatforms} value={platforms} onChange={setPlatforms} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ad-budget">Budget (₹)</Label>
                  <Input id="ad-budget" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ad-duration">Duration (days)</Label>
                  <Input id="ad-duration" type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ad-audience">Target audience</Label>
                <Textarea id="ad-audience" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} rows={2} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ad-location">Location</Label>
                <Input id="ad-location" value={location} onChange={(e) => setLocation(e.target.value)} />
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="ad-form" disabled={saving}>
              {saving ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This permanently deletes the ad campaign and its stats. This cannot be undone."
        onConfirm={confirmRemove}
      />
    </div>
  );
});

// ---------- Monthly Reports ----------

interface ReportFile {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: string;
  uploadedBy: ActorRef | null;
}

interface MonthlyReport {
  id: string;
  year: number;
  month: number;
  title: string | null;
  description: string | null;
  reach: number | null;
  engagement: number | null;
  followersGained: number | null;
  adLeads: number | null;
  insights: string | null;
  nextMonthPlan: string | null;
  reviewedAt: string | null;
  files: ReportFile[];
  createdAt: string;
  createdBy: ActorRef;
  updatedAt: string;
  updatedBy: ActorRef | null;
}

/** Add/remove/replace files on an already-saved report — same base64-in-MySQL upload used for task attachments and project documents. */
function ReportFiles({ report, onChanged }: { report: MonthlyReport; onChanged: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch(`/api/social/reports/${report.id}/files`, { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(`Couldn't upload ${file.name}`, data.error);
          continue;
        }
      }
      onChanged();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(fileId: string) {
    const res = await fetch(`/api/social/reports/${report.id}/files/${fileId}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't remove the file");
    onChanged();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {report.files.length > 0 && (
        <ul className="flex flex-col gap-1">
          {report.files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-xs">
              <a
                href={`/api/uploads/${f.filePath}?mode=view`}
                target="_blank"
                rel="noreferrer"
                className="truncate text-primary hover:underline"
              >
                {f.fileName}
              </a>
              <button
                type="button"
                aria-label={`Remove ${f.fileName}`}
                onClick={() => remove(f.id)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <IconTrash className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? "Uploading..." : report.files.length > 0 ? "Add more files" : "Upload files"}
        </Button>
      </div>
    </div>
  );
}

const ReportsTab = forwardRef<TabCreateHandle, { clientId: string; onChanged: () => void }>(function ReportsTab({ clientId, onChanged }, ref) {
  const toast = useToast();
  const [reports, setReports] = useState<MonthlyReport[] | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MonthlyReport | null>(null);

  async function load() {
    const res = await fetch(`/api/social/clients/${clientId}/reports`);
    if (res.ok) setReports((await res.json()).reports);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function openCreate() {
    setTitle("");
    setDescription("");
    setPendingFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setOpen(true);
  }

  useImperativeHandle(ref, () => ({ openCreate }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // One report per client+month (see the API's upsert) — this always
      // targets the current month, matching "add this month's report"; the
      // detailed metrics fields still exist on the record for later editing,
      // just not surfaced in this stripped-down add form.
      const now = new Date();
      const res = await fetch(`/api/social/clients/${clientId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          title: title || null,
          description: description || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save report", data.error);

      for (const file of pendingFiles) {
        const body = new FormData();
        body.set("file", file);
        const fileRes = await fetch(`/api/social/reports/${data.report.id}/files`, { method: "POST", body });
        if (!fileRes.ok) toast.error(`Couldn't upload ${file.name}`);
      }

      setOpen(false);
      toast.success("Monthly report saved");
      load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/social/reports/${deleteTarget.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete report");
    toast.success("Monthly report deleted");
    setDeleteTarget(null);
    load();
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      {reports === null ? (
        <SkeletonForm fields={3} />
      ) : reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No monthly reports yet.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">
                    {r.title || `${MONTH_NAMES[r.month - 1]} ${r.year}`}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {MONTH_NAMES[r.month - 1]} {r.year}
                    </span>
                    {r.reviewedAt && <Badge variant="success" className="ml-2">Reviewed</Badge>}
                  </p>
                  <button type="button" aria-label={`Delete ${MONTH_NAMES[r.month - 1]} ${r.year} report`} onClick={() => setDeleteTarget(r)} className="text-muted-foreground hover:text-destructive">
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
                {r.description && <p className="text-sm">{r.description}</p>}
                {/* The add form no longer collects these metrics, so a freshly
                    created report has all four null — showing four dashes
                    every time would just be noise. Still shown once any one
                    of them is actually set (e.g. an older report). */}
                {(r.reach != null || r.engagement != null || r.followersGained != null || r.adLeads != null) && (
                  <p className="text-xs text-muted-foreground">
                    Reach {r.reach ?? "—"} · Engagement {r.engagement ?? "—"} · Followers gained {r.followersGained ?? "—"} · Ad leads {r.adLeads ?? "—"}
                  </p>
                )}
                {r.insights && <p className="mt-1 text-sm">{r.insights}</p>}
                {r.nextMonthPlan && <p className="text-sm text-muted-foreground">Next month: {r.nextMonthPlan}</p>}
                <ReportFiles report={r} onChanged={load} />
                <AuditLine createdAt={r.createdAt} createdBy={r.createdBy} updatedAt={r.updatedAt} updatedBy={r.updatedBy} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Monthly report</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="report-form" onSubmit={save} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-title">Title</Label>
                <Input
                  id="report-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-description">Description</Label>
                <Textarea id="report-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-files">Files</Label>
                {pendingFiles.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {pendingFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-xs">
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <input
                  id="report-files"
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => setPendingFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                />
                <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  {pendingFiles.length > 0 ? "Add more files" : "Upload files"}
                </Button>
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="report-form" disabled={saving}>
              {saving ? "Saving..." : "Save report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget ? `${MONTH_NAMES[deleteTarget.month - 1]} ${deleteTarget.year}` : ""} report?`}
        description="This permanently deletes the monthly report. This cannot be undone."
        onConfirm={confirmRemove}
      />
    </div>
  );
});

// ---------- Content Calendar ----------

const CALENDAR_TYPE_OPTIONS = [
  { value: "", label: "Empty" },
  { value: "STATIC_POST", label: "Static Post" },
  { value: "CAROUSEL", label: "Carousel" },
  { value: "AI_REEL", label: "AI Reel" },
  { value: "REAL_PERSON_REEL", label: "Real Person Reel" },
  { value: "OTHER", label: "Other (note)" },
];

/** Base list shown before any search/typing narrows it down. */
const CALENDAR_NUMBER_BASE_RANGE = Array.from({ length: 20 }, (_, i) => i + 1);

const CALENDAR_STATUS_OPTIONS: { value: CalendarSlotStatus; label: string }[] = [
  { value: "DONE", label: "Completed / Uploaded" },
  { value: "PENDING", label: "Pending" },
  { value: "NOT_UPLOADED", label: "Not Uploaded" },
];

/** Text color for a filled cell's label, by status — green/orange/red. */
const CALENDAR_STATUS_TEXT_CLASS: Record<CalendarSlotStatus, string> = {
  DONE: "text-emerald-600 dark:text-emerald-400",
  PENDING: "text-amber-600 dark:text-amber-400",
  NOT_UPLOADED: "text-red-600 dark:text-red-400",
};

const CALENDAR_DATE_FILTER_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "range", label: "Date range" },
];

const CALENDAR_DELIVERABLES = { STATIC_POST: 8, CAROUSEL: 2, REEL: 4 } as const;

/**
 * Direction-aware month transition — the incoming month slides in from
 * whichever side matches the nav direction (+1 next → from the right, -1
 * prev → from the left) and the outgoing one exits the opposite way, the
 * same "custom" pattern framer-motion's own docs use for this exact
 * carousel/calendar case.
 */
const calendarSlideVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction * -24 }),
};

/** Resolves a date-filter preset to the month/year it should jump to. "range" is handled separately via the date picker. */
function resolveCalendarPreset(preset: string): { month: number; year: number } | null {
  const now = new Date();
  switch (preset) {
    case "today":
      return { month: now.getMonth() + 1, year: now.getFullYear() };
    case "yesterday": {
      const d = subDays(now, 1);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    }
    case "weekly": {
      const d = startOfWeek(now, { weekStartsOn: 1 });
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    }
    case "monthly":
      return { month: now.getMonth() + 1, year: now.getFullYear() };
    case "quarterly": {
      const d = startOfQuarter(now);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    }
    case "yearly":
      return { month: 1, year: now.getFullYear() };
    default:
      return null;
  }
}

/** An icon-only trigger that opens a text menu of options — compact header control. */
function IconOnlyDropdown({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <span>
          <Tooltip label={label}>
            <button
              type="button"
              aria-label={label}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-md text-primary-foreground/80 transition-colors hover:bg-white/10 hover:text-primary-foreground",
                open && "bg-white/10 text-primary-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          </Tooltip>
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                if (opt.value !== "range") setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-primary/5",
                opt.value === value && "bg-accent/60"
              )}
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          ))}
          {footer}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * The "Number" field: "Auto (by order)" stays pinned at the top exactly as
 * before, plus a search box that filters the base 1–20 list and, if you
 * type a number outside that range, offers it as an addable custom option.
 */
function CalendarNumberDropdown({
  value,
  onChange,
}: {
  /** "" = Auto (by order). */
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const trimmed = search.trim();
  const typedNumber = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const filtered = trimmed
    ? CALENDAR_NUMBER_BASE_RANGE.filter((n) => String(n).includes(trimmed))
    : CALENDAR_NUMBER_BASE_RANGE;
  const showAddCustom = typedNumber !== null && typedNumber > 0 && !CALENDAR_NUMBER_BASE_RANGE.includes(typedNumber);

  function pick(n: string) {
    onChange(n);
    setSearch("");
    setOpen(false);
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          id="cc-number"
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:border-ring/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Auto (by order)"}</span>
          <IconChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          <div className="p-1">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="Search or type a number..."
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            <button
              type="button"
              onClick={() => pick("")}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-primary/5",
                value === "" && "bg-accent/60"
              )}
            >
              <span className="truncate">Auto (by order)</span>
              {value === "" && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
            {showAddCustom && (
              <button
                type="button"
                onClick={() => pick(String(typedNumber))}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary outline-none hover:bg-primary/5"
              >
                <IconPlus className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Add {typedNumber}</span>
              </button>
            )}
            {filtered.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => pick(String(n))}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-primary/5",
                  String(n) === value && "bg-accent/60"
                )}
              >
                <span className="truncate">{n}</span>
                {String(n) === value && <IconCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            ))}
            {filtered.length === 0 && !showAddCustom && (
              <p className="px-2 py-3 text-center text-sm text-muted-foreground">No matches</p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Lives inside this one client's folder now (used to be its own page,
 * picked a client from a dropdown) — same grid, edit dialog, and date
 * filter, just scoped to `clientId` from the tab's own props.
 */
function CalendarTab({ clientId }: { clientId: string }) {
  const toast = useToast();
  const { socket } = useSocket();
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [dateFilter, setDateFilter] = useState("monthly");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [slots, setSlots] = useState<CalendarSlot[] | null>(null);
  // Only the very first load shows the full skeleton. Switching months keeps the
  // Card mounted (previous month's grid stays on screen until the new data
  // arrives) — swapping the whole Card out on every nav killed the slide
  // animation and reflowed the rest of the page around it.
  const [initialLoading, setInitialLoading] = useState(true);

  // A live day/date/time readout in the header — ticks on its own timer
  // rather than once at render, so it doesn't go stale on a tab left open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const [editing, setEditing] = useState<{ week: number; weekday: CalendarWeekday } | null>(null);
  const [editType, setEditType] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editNumber, setEditNumber] = useState("");
  const [editStatus, setEditStatus] = useState<CalendarSlotStatus>("NOT_UPLOADED");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/social/calendar?clientId=${clientId}&year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setInitialLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, year, month]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { clientId?: string }) => {
      if (payload?.clientId === clientId) load();
    };
    socket.on("social_calendar_updated", handler);
    return () => {
      socket.off("social_calendar_updated", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, clientId, year, month]);

  const byKey = useMemo(() => {
    const map = new Map<string, CalendarSlot>();
    for (const s of slots ?? []) map.set(calendarSlotKey(s.week, s.weekday), s);
    return map;
  }, [slots]);

  const labels = useMemo(() => calendarLabelsFor(slots ?? []), [slots]);
  const weekDates = useMemo(() => monthGridDates(year, month), [year, month]);
  const weekNumbers = useMemo(() => weekDates.map((_, i) => i + 1), [weekDates]);

  // +1 slides the new month in from the right (going forward), -1 from the
  // left (going back) — set right before the month/year change that
  // triggers the transition, read by the AnimatePresence below.
  const [direction, setDirection] = useState(1);

  function goToMonth(delta: number) {
    setDirection(delta);
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    } else if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  }

  function applyDateFilter(preset: string) {
    setDateFilter(preset);
    const resolved = resolveCalendarPreset(preset);
    if (resolved) {
      setMonth(resolved.month);
      setYear(resolved.year);
    }
  }

  function applyDateRange(from: string, to: string) {
    setRangeFrom(from);
    setRangeTo(to);
    setDateFilter("range");
    // The grid can only show one month — jump to the range's start date.
    if (!from) return;
    const d = parseISO(from);
    setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
  }

  function openCell(week: number, weekday: CalendarWeekday) {
    const existing = byKey.get(calendarSlotKey(week, weekday));
    setEditType(existing?.contentType ?? (existing?.note ? "OTHER" : ""));
    setEditNote(existing?.note ?? "");
    setEditNumber(existing?.manualNumber ? String(existing.manualNumber) : "");
    setEditStatus(existing?.status ?? "NOT_UPLOADED");
    setEditing({ week, weekday });
  }

  async function saveCell() {
    if (!editing) return;
    setSaving(true);
    try {
      const contentType = editType && editType !== "OTHER" ? editType : null;
      const note = editType === "OTHER" ? editNote : null;
      const res = await fetch("/api/social/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          year,
          month,
          week: editing.week,
          weekday: editing.weekday,
          contentType,
          note: note || null,
          manualNumber: editNumber ? Number(editNumber) : null,
          status: editStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save", data.error);
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function clearCell() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch("/api/social/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, year, month, week: editing.week, weekday: editing.weekday, contentType: null, note: null }),
      });
      if (!res.ok) return toast.error("Couldn't clear cell");
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  const dateFilterDropdown = (
    <IconOnlyDropdown
      icon={IconCalendar}
      label="Date filter"
      value={dateFilter}
      onChange={applyDateFilter}
      options={CALENDAR_DATE_FILTER_OPTIONS}
      footer={
        dateFilter === "range" ? (
          <div className="px-2 pb-1 pt-2">
            <DateRangePicker from={rangeFrom} to={rangeTo} onChange={applyDateRange} placeholder="Pick a range" />
          </div>
        ) : null
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {initialLoading ? (
        <SkeletonForm fields={4} />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-primary px-5 py-3 text-primary-foreground">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Previous month"
                  onClick={() => goToMonth(-1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/15"
                >
                  <IconChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[9rem] text-center text-sm font-semibold">
                  {MONTH_NAMES[month - 1]} {year}
                </span>
                <button
                  type="button"
                  aria-label="Next month"
                  onClick={() => goToMonth(1)}
                  className="flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-white/15"
                >
                  <IconChevronRight className="h-4 w-4" />
                </button>
              </div>
              <span className="text-xs text-primary-foreground/80">
                {format(now, "EEEE, d MMMM yyyy")} · {format(now, "h:mm a")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-primary-foreground/80 sm:inline">
                Deliverables: {CALENDAR_DELIVERABLES.STATIC_POST} Static Posts &bull; {CALENDAR_DELIVERABLES.CAROUSEL}{" "}
                Carousels &bull; {CALENDAR_DELIVERABLES.REEL} Reels
              </span>
              {dateFilterDropdown}
            </div>
          </div>
          {/* The grid is always 6 weeks (see monthGridDates), so the table's
              height is naturally fixed across every month — no min-height
              hack needed to stop it from jumping between months. */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary/90 text-primary-foreground">
                  <th className="px-4 py-2.5 text-center font-medium">Week</th>
                  {CALENDAR_WEEKDAYS.map((d) => (
                    <th key={d} className="px-4 py-2.5 text-center font-medium">{CALENDAR_WEEKDAY_LABELS[d]}</th>
                  ))}
                </tr>
              </thead>
              <AnimatePresence mode="wait" custom={direction} initial={false}>
                <motion.tbody
                  key={`${year}-${month}`}
                  custom={direction}
                  variants={calendarSlideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  {weekNumbers.map((week) => (
                    <tr key={week} className="border-b border-border last:border-b-0 odd:bg-muted/30">
                      <td className="px-4 py-3 font-medium">Week {week}</td>
                      {CALENDAR_WEEKDAYS.map((weekday, weekdayIndex) => {
                        const slot = byKey.get(calendarSlotKey(week, weekday));
                        const label = slot ? labels.get(slot.id) : undefined;
                        const date = weekDates[week - 1][weekdayIndex];
                        const inMonth = date.getMonth() === month - 1;
                        const isToday = isSameDay(date, now);
                        const isSunday = weekday === "SUNDAY";
                        // Precedence: today (solid red fill) beats Sunday (light red
                        // tint + red border) beats the normal filled/empty look — a
                        // Sunday that also happens to be today reads as "today".
                        const cellStateClasses = isToday
                          ? "border-solid border-primary bg-primary font-medium text-primary-foreground"
                          : label
                            ? cn(
                                "border-solid font-medium",
                                CALENDAR_STATUS_TEXT_CLASS[slot!.status],
                                isSunday ? "border-primary/50 bg-primary/10" : "border-border bg-card"
                              )
                            : isSunday
                              ? "border-dashed border-primary/40 bg-primary/10 text-primary/80"
                              : "border-dashed border-border text-muted-foreground";
                        // Today is already solid red — a 5%-opacity red hover overlay
                        // replaces that solid fill outright and washes it to near-white
                        // in light mode, so only the non-today cells get it.
                        const hoverBgClass = isToday ? "" : "hover:bg-primary/5";
                        // Leading/trailing cells belong to the adjacent month, not this
                        // one — clicking them can't sanely open an edit dialog keyed to
                        // the wrong month, so it jumps the whole grid to that month
                        // instead (same as clicking a header nav arrow).
                        const monthIndex = year * 12 + (month - 1);
                        const cellMonthIndex = date.getFullYear() * 12 + date.getMonth();
                        const spilloverDirection = cellMonthIndex < monthIndex ? -1 : 1;
                        return (
                          <td key={weekday} className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => (inMonth ? openCell(week, weekday) : goToMonth(spilloverDirection))}
                              className={cn(
                                "flex w-full min-w-[7rem] flex-col items-center justify-center gap-0.5 rounded-md border px-3 py-2 text-sm transition-all hover:scale-[1.02] hover:border-primary hover:opacity-100 active:scale-95",
                                hoverBgClass,
                                cellStateClasses,
                                !inMonth && "opacity-50"
                              )}
                            >
                              <span className="text-[11px] font-semibold tabular-nums opacity-80">{date.getDate()}</span>
                              <span>{label ?? "—"}</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </motion.tbody>
              </AnimatePresence>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing && `Week ${editing.week} · ${CALENDAR_WEEKDAY_LABELS[editing.weekday]}`}
            </DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cc-type">Type</Label>
                <Dropdown id="cc-type" value={editType} onChange={setEditType} options={CALENDAR_TYPE_OPTIONS} />
              </div>
              {editType && editType !== "OTHER" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cc-number">Number</Label>
                  <CalendarNumberDropdown value={editNumber} onChange={setEditNumber} />
                </div>
              )}
              {editType === "OTHER" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cc-note">Note</Label>
                  <Textarea id="cc-note" value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} placeholder="e.g. Planning Meeting" />
                </div>
              )}
              {editType && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cc-status">Status</Label>
                  <Dropdown id="cc-status" value={editStatus} onChange={(v) => setEditStatus(v as CalendarSlotStatus)} options={CALENDAR_STATUS_OPTIONS} />
                </div>
              )}
            </div>
          </DialogBody>
          <DialogFooter>
            {byKey.has(editing ? calendarSlotKey(editing.week, editing.weekday) : "") && (
              <Button variant="outline" onClick={clearCell} disabled={saving}>
                Clear
              </Button>
            )}
            <Button onClick={saveCell} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Activity ----------

interface ActivityRow {
  id: string;
  action: string;
  meta: Record<string, unknown> | null;
  actor: { id: string; name: string };
  createdAt: string;
}

/** Human-readable label for every action string this module logs, across all six tabs. */
const ACTIVITY_LABELS: Record<string, string> = {
  created: "Client created",
  created_from_lead: "Client created (from an approved lead)",
  stage_changed: "Client stage changed",
  platform_added: "Platform added",
  platform_updated: "Platform updated",
  platform_removed: "Platform removed",
  content_created: "Content created",
  content_updated: "Content updated",
  content_stage_changed: "Content stage changed",
  content_deleted: "Content deleted",
  ad_campaign_created: "Ad campaign created",
  ad_campaign_updated: "Ad campaign updated",
  ad_stage_changed: "Ad campaign stage changed",
  ad_campaign_deleted: "Ad campaign deleted",
  monthly_report_created: "Monthly report created",
  monthly_report_updated: "Monthly report updated",
  monthly_report_deleted: "Monthly report deleted",
  calendar_slot_updated: "Calendar slot added/updated",
  calendar_slot_cleared: "Calendar slot cleared",
  folder_created: "Folder created",
  folder_renamed: "Folder renamed",
  folder_deleted: "Folder deleted",
  image_uploaded: "Image uploaded",
  image_renamed: "Image renamed",
  image_moved: "Image moved",
  image_deleted: "Image deleted",
};

function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ActivityKind = "created" | "updated" | "deleted" | "viewed" | "other";

function activityKind(action: string): ActivityKind {
  if (action.includes("deleted") || action.includes("removed") || action.includes("cleared")) return "deleted";
  if (action.includes("created") || action.includes("uploaded")) return "created";
  if (action.includes("updated") || action.includes("changed") || action.includes("renamed") || action.includes("moved")) return "updated";
  if (action.includes("viewed")) return "viewed";
  return "other";
}

const ACTIVITY_BADGE_VARIANT: Record<ActivityKind, "success" | "default" | "destructive" | "secondary"> = {
  created: "success",
  updated: "default",
  deleted: "destructive",
  viewed: "secondary",
  other: "secondary",
};

/** A short "what" line pulled from the event's meta — the specific platform, title, or stage transition involved. */
function activityDetail(a: ActivityRow): string | null {
  const meta = a.meta;
  if (!meta) return null;
  if (typeof meta.from === "string" && typeof meta.to === "string") {
    return `${meta.from.replace(/_/g, " ")} → ${meta.to.replace(/_/g, " ")}`;
  }
  if (typeof meta.title === "string") return meta.title;
  if (typeof meta.name === "string") return meta.name;
  if (typeof meta.fileName === "string") return meta.fileName;
  if (typeof meta.platform === "string") return meta.platform;
  if (typeof meta.year === "number" && typeof meta.month === "number") return `${MONTH_NAMES[meta.month - 1]} ${meta.year}`;
  if (typeof meta.week === "number" && typeof meta.weekday === "string") return `Week ${meta.week} · ${meta.weekday}`;
  return null;
}

/**
 * A proper table — Action | Details | Performed by | Date & time — instead
 * of a flat sentence feed. Every create/update/delete this module logs (see
 * ACTIVITY_LABELS) shows up here with who did it and exactly when.
 */
function ActivityTab({ clientId }: { clientId: string }) {
  const [activities, setActivities] = useState<ActivityRow[] | null>(null);

  useEffect(() => {
    fetch(`/api/social/clients/${clientId}/activity`)
      .then((r) => (r.ok ? r.json() : { activities: [] }))
      .then((d) => setActivities(d.activities ?? []))
      .catch(() => setActivities([]));
  }, [clientId]);

  if (activities === null) return <SkeletonForm fields={3} />;
  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">No activity recorded yet.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Action</th>
              <th className="px-4 py-2.5 font-medium">Details</th>
              <th className="px-4 py-2.5 font-medium">Performed by</th>
              <th className="px-4 py-2.5 font-medium">Date &amp; time</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => {
              const kind = activityKind(a.action);
              const detail = activityDetail(a);
              return (
                <tr key={a.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5">
                    <Badge variant={ACTIVITY_BADGE_VARIANT[kind]}>{activityLabel(a.action)}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{detail ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium">{a.actor.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{format(parseISO(a.createdAt), "MMM d, yyyy · h:mm a")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
