"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { Checkbox } from "@/components/ui/checkbox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkeletonForm } from "@/components/ui/skeleton";
import { IconChevronLeft, IconPlus, IconTrash, IconEye, IconEyeOff } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { stagesFor, nextStage, stageLabel } from "@/lib/social-content-workflow";
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

const AD_STAGE_OPTIONS = [
  { value: "DISCUSSION", label: "Campaign discussion" },
  { value: "BUDGET_DURATION", label: "Budget & duration" },
  { value: "TARGETING", label: "Targeting" },
  { value: "CONTENT_APPROVAL", label: "Content approval" },
  { value: "AD_CREATION", label: "Ad creation" },
  { value: "GROUP_APPROVAL", label: "Group approval" },
  { value: "CAMPAIGN_SETUP", label: "Campaign setup" },
  { value: "RUNNING", label: "Running" },
  { value: "REPORTING", label: "Reporting" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTHLY_TARGETS = { STATIC_POST: 8, CAROUSEL: 2, AI_REEL: 2, REAL_PERSON_REEL: 2 } as const;

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
    credentialsUpdatedAt: string | null;
    notes: string | null;
  }[];
  _count: { contentItems: number; adCampaigns: number; monthlyReports: number };
}

type TabKey = "platforms" | "content" | "ads" | "reports" | "calendar" | "activity";

export function SocialClientDetailView({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>("platforms");
  const [editOpen, setEditOpen] = useState(false);

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
    return (
      <div className="flex min-h-[55vh] flex-1 items-center justify-center">
        <SkeletonForm fields={6} />
      </div>
    );
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
    { key: "platforms", label: "Platforms", count: client.platformAccounts.length },
    { key: "content", label: "Content", count: client._count.contentItems },
    { key: "ads", label: "Ads", count: client._count.adCampaigns },
    { key: "reports", label: "Monthly Reports", count: client._count.monthlyReports },
    { key: "calendar", label: "Calendar" },
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

      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              tab === t.key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-1 text-xs tabular-nums text-muted-foreground">({t.count})</span>}
          </button>
        ))}
      </div>

      {tab === "platforms" && <PlatformsTab clientId={client.id} accounts={client.platformAccounts} onChanged={load} />}
      {tab === "content" && <ContentTab clientId={client.id} />}
      {tab === "ads" && <AdsTab clientId={client.id} onChanged={load} />}
      {tab === "reports" && <ReportsTab clientId={client.id} onChanged={load} />}
      {tab === "calendar" && <CalendarTab clientId={client.id} />}
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

function BackLink() {
  return (
    <Link href="/social-media" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <IconChevronLeft className="h-4 w-4" />
      Back to Social Media
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

function PlatformsTab({
  clientId,
  accounts,
  onChanged,
}: {
  clientId: string;
  accounts: Client["platformAccounts"];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [platform, setPlatform] = useState("FACEBOOK");
  const [handle, setHandle] = useState("");
  const [received, setReceived] = useState(false);
  const [notes, setNotes] = useState("");
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasStoredPassword, setHasStoredPassword] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [saving, setSaving] = useState(false);

  function openFor(existing?: Client["platformAccounts"][number]) {
    setEditingId(existing?.id ?? null);
    setPlatform(existing?.platform ?? "FACEBOOK");
    setHandle(existing?.handle ?? "");
    setReceived(existing?.credentialsReceived ?? false);
    setNotes(existing?.notes ?? "");
    setPassword("");
    setPasswordTouched(false);
    setShowPassword(false);
    setHasStoredPassword(!!existing?.credentialsUpdatedAt);
    setOpen(true);
  }

  async function reveal() {
    if (!editingId) return;
    setRevealing(true);
    try {
      const res = await fetch(`/api/social/clients/${clientId}/platforms/${editingId}/reveal`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't reveal password", data.error);
      setPassword(data.password);
      setShowPassword(true);
      // Doesn't count as "touched" — this is the existing saved value, not a
      // new one. Saving without further edits should leave it as-is rather
      // than re-encrypt-and-store what's already stored.
    } finally {
      setRevealing(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/social/clients/${clientId}/platforms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          handle: handle || null,
          credentialsReceived: received,
          notes: notes || null,
          ...(passwordTouched && { password }),
        }),
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

  async function remove(id: string) {
    const res = await fetch(`/api/social/clients/${clientId}/platforms/${id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't remove platform");
    toast.success("Platform removed");
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Handle and login password, encrypted at rest. Viewing a saved password is logged to this client&apos;s Activity tab.
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openFor()}>
          <IconPlus className="h-4 w-4" />
          Add platform
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id} className="cursor-pointer" onClick={() => openFor(a)}>
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{PLATFORM_OPTIONS.find((p) => p.value === a.platform)?.label ?? a.platform}</p>
                <button
                  type="button"
                  aria-label={`Remove ${a.platform}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(a.id);
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
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">No platforms added yet.</p>
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="platform-password">Password</Label>
                  {hasStoredPassword && !passwordTouched && (
                    <button
                      type="button"
                      onClick={reveal}
                      disabled={revealing}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      {revealing ? "Revealing..." : "Reveal saved password"}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="platform-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="off"
                    className="pr-9"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordTouched(true);
                    }}
                    placeholder={hasStoredPassword ? "•••••••• (saved — reveal or type to replace)" : "Enter password"}
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
                <p className="text-xs text-muted-foreground">
                  Stored encrypted. Leave blank to keep the existing password unchanged.
                </p>
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
    </div>
  );
}

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
  createdBy: { id: string; name: string };
  updatedAt: string;
}

function ContentTab({ clientId }: { clientId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("STATIC_POST");
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [saving, setSaving] = useState(false);

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

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

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
    toast.success(toStage === "CANCELLED" ? "Content cancelled" : `Moved to ${stageLabel(toStage as never)}`);
    load();
  }

  async function remove(item: ContentItem) {
    const res = await fetch(`/api/social/content/${item.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't delete content");
    toast.success("Content deleted");
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <IconPlus className="h-4 w-4" />
          New content
        </Button>
      </div>

      {items === null ? (
        <SkeletonForm fields={4} />
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No content yet for this client.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const upcoming = nextStage(item.type as never, item.stage as never);
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-col gap-2 p-4">
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
                    <button type="button" aria-label={`Delete ${item.title}`} onClick={() => remove(item)} className="text-muted-foreground hover:text-destructive">
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.stage === "PUBLISHED" ? "success" : item.stage === "CANCELLED" ? "destructive" : "default"}>
                      {stageLabel(item.stage as never)}
                    </Badge>
                    {upcoming && (
                      <Button size="sm" variant="outline" onClick={() => transition(item, upcoming)}>
                        Move to: {stageLabel(upcoming)}
                      </Button>
                    )}
                    {item.stage !== "PUBLISHED" && item.stage !== "CANCELLED" && (
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => transition(item, "CANCELLED")}>
                        Cancel
                      </Button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Sequence: {stagesFor(item.type as never).map((s) => stageLabel(s)).join(" → ")}
                  </div>
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
                <div className="flex flex-wrap gap-3">
                  {PLATFORM_OPTIONS.map((p) => (
                    <label key={p.value} className="flex items-center gap-1.5 text-sm">
                      <Checkbox checked={platforms.includes(p.value)} onChange={() => togglePlatform(p.value)} aria-label={p.label} />
                      {p.label}
                    </label>
                  ))}
                </div>
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
    </div>
  );
}

// ---------- Ads ----------

interface AdCampaign {
  id: string;
  name: string;
  objective: string;
  stage: string;
  budget: string | number | null;
  reach: number | null;
  leadsGenerated: number | null;
}

function AdsTab({ clientId, onChanged }: { clientId: string; onChanged: () => void }) {
  const toast = useToast();
  const [ads, setAds] = useState<AdCampaign[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("LEADS");
  const [budget, setBudget] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

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
    setBudget("");
    setDurationDays("");
    setTargetAudience("");
    setLocation("");
    setOpen(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/social/clients/${clientId}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          objective,
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

  async function setStage(ad: AdCampaign, stage: string) {
    setAds((prev) => prev?.map((a) => (a.id === ad.id ? { ...a, stage } : a)) ?? null);
    const res = await fetch(`/api/social/ads/${ad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      toast.error("Couldn't update stage");
      load();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <IconPlus className="h-4 w-4" />
          New campaign
        </Button>
      </div>

      {ads === null ? (
        <SkeletonForm fields={3} />
      ) : ads.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No ad campaigns yet.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {ads.map((ad) => (
            <Card key={ad.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{ad.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Objective: {ad.objective} {ad.budget != null && `· Budget ₹${ad.budget}`}
                    {ad.reach != null && ` · Reach ${ad.reach}`}
                    {ad.leadsGenerated != null && ` · Leads ${ad.leadsGenerated}`}
                  </p>
                </div>
                <div className="w-56">
                  <Dropdown size="sm" value={ad.stage} onChange={(v) => setStage(ad, v)} options={AD_STAGE_OPTIONS} />
                </div>
              </CardContent>
            </Card>
          ))}
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
    </div>
  );
}

// ---------- Monthly Reports ----------

interface MonthlyReport {
  id: string;
  year: number;
  month: number;
  reach: number | null;
  engagement: number | null;
  followersGained: number | null;
  adLeads: number | null;
  insights: string | null;
  nextMonthPlan: string | null;
  reviewedAt: string | null;
}

function ReportsTab({ clientId, onChanged }: { clientId: string; onChanged: () => void }) {
  const toast = useToast();
  const now = new Date();
  const [reports, setReports] = useState<MonthlyReport[] | null>(null);
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reach, setReach] = useState("");
  const [engagement, setEngagement] = useState("");
  const [followersGained, setFollowersGained] = useState("");
  const [bestPosts, setBestPosts] = useState("");
  const [adLeads, setAdLeads] = useState("");
  const [insights, setInsights] = useState("");
  const [retargetingSuggestions, setRetargetingSuggestions] = useState("");
  const [nextMonthPlan, setNextMonthPlan] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/social/clients/${clientId}/reports`);
    if (res.ok) setReports((await res.json()).reports);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function openCreate() {
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setReach("");
    setEngagement("");
    setFollowersGained("");
    setBestPosts("");
    setAdLeads("");
    setInsights("");
    setRetargetingSuggestions("");
    setNextMonthPlan("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/social/clients/${clientId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          reach: reach ? Number(reach) : null,
          engagement: engagement ? Number(engagement) : null,
          followersGained: followersGained ? Number(followersGained) : null,
          bestPosts: bestPosts || null,
          adLeads: adLeads ? Number(adLeads) : null,
          insights: insights || null,
          retargetingSuggestions: retargetingSuggestions || null,
          nextMonthPlan: nextMonthPlan || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save report", data.error);
      setOpen(false);
      toast.success("Monthly report saved");
      load();
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <IconPlus className="h-4 w-4" />
          New monthly report
        </Button>
      </div>

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
                <p className="font-medium">
                  {MONTH_NAMES[r.month - 1]} {r.year}
                  {r.reviewedAt && <Badge variant="success" className="ml-2">Reviewed</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  Reach {r.reach ?? "—"} · Engagement {r.engagement ?? "—"} · Followers gained {r.followersGained ?? "—"} · Ad leads {r.adLeads ?? "—"}
                </p>
                {r.insights && <p className="mt-1 text-sm">{r.insights}</p>}
                {r.nextMonthPlan && <p className="text-sm text-muted-foreground">Next month: {r.nextMonthPlan}</p>}
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
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-month">Month</Label>
                  <Dropdown
                    id="report-month"
                    value={String(month)}
                    onChange={(v) => setMonth(Number(v))}
                    options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-year">Year</Label>
                  <Input id="report-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-reach">Reach</Label>
                  <Input id="report-reach" type="number" min="0" value={reach} onChange={(e) => setReach(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-engagement">Engagement</Label>
                  <Input id="report-engagement" type="number" min="0" value={engagement} onChange={(e) => setEngagement(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-followers">Followers gained</Label>
                  <Input id="report-followers" type="number" value={followersGained} onChange={(e) => setFollowersGained(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-adleads">Ad leads</Label>
                  <Input id="report-adleads" type="number" min="0" value={adLeads} onChange={(e) => setAdLeads(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-bestposts">Best posts</Label>
                <Textarea id="report-bestposts" value={bestPosts} onChange={(e) => setBestPosts(e.target.value)} rows={2} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-insights">Insights & learnings</Label>
                <Textarea id="report-insights" value={insights} onChange={(e) => setInsights(e.target.value)} rows={2} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-retargeting">Retargeting suggestions</Label>
                <Textarea id="report-retargeting" value={retargetingSuggestions} onChange={(e) => setRetargetingSuggestions(e.target.value)} rows={2} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-nextmonth">Next month&apos;s content strategy &amp; campaign plan</Label>
                <Textarea id="report-nextmonth" value={nextMonthPlan} onChange={(e) => setNextMonthPlan(e.target.value)} rows={2} />
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
    </div>
  );
}

// ---------- Calendar ----------

function CalendarTab({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const now = new Date();

  useEffect(() => {
    fetch(`/api/social/clients/${clientId}/content`)
      .then((r) => r.json())
      .then((d) => setItems(d.content))
      .catch(() => setItems([]));
  }, [clientId]);

  if (items === null) return <SkeletonForm fields={3} />;

  const thisMonth = items.filter((i) => {
    if (!i.scheduledFor) return false;
    const d = parseISO(i.scheduledFor);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const counts = { STATIC_POST: 0, CAROUSEL: 0, AI_REEL: 0, REAL_PERSON_REEL: 0 } as Record<string, number>;
  for (const i of thisMonth) counts[i.type] = (counts[i.type] ?? 0) + 1;

  const weeks = new Map<number, ContentItem[]>();
  for (const item of thisMonth) {
    const weekOfMonth = Math.ceil(parseISO(item.scheduledFor!).getDate() / 7);
    weeks.set(weekOfMonth, [...(weeks.get(weekOfMonth) ?? []), item]);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-sm font-medium">
            {MONTH_NAMES[now.getMonth()]} {now.getFullYear()} — pace against the suggested monthly deliverables
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Static posts: {counts.STATIC_POST}/{MONTHLY_TARGETS.STATIC_POST}</span>
            <span>Carousels: {counts.CAROUSEL}/{MONTHLY_TARGETS.CAROUSEL}</span>
            <span>AI reels: {counts.AI_REEL}/{MONTHLY_TARGETS.AI_REEL}</span>
            <span>Real-person reels: {counts.REAL_PERSON_REEL}/{MONTHLY_TARGETS.REAL_PERSON_REEL}</span>
          </div>
        </CardContent>
      </Card>

      {thisMonth.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Nothing scheduled this month yet.</CardContent>
        </Card>
      ) : (
        [...weeks.entries()].sort(([a], [b]) => a - b).map(([week, weekItems]) => (
          <Card key={week}>
            <CardContent className="p-4">
              <p className="mb-2 text-sm font-medium">Week {week}</p>
              <div className="flex flex-col gap-1.5">
                {weekItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span>
                      {item.title} <span className="text-xs text-muted-foreground">({CONTENT_TYPE_OPTIONS.find((t) => t.value === item.type)?.label})</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{format(parseISO(item.scheduledFor!), "EEE, MMM d · h:mm a")}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}
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
      <CardContent className="divide-y divide-border/60 p-0">
        {activities.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
            <span>
              <span className="font-medium">{a.actor.name}</span> {a.action.replace(/_/g, " ")}
            </span>
            <span className="text-xs text-muted-foreground">{format(parseISO(a.createdAt), "MMM d, h:mm a")}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
