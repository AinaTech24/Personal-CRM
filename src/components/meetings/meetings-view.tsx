"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { userOptionLabel } from "@/lib/user-display";
import { format, isAfter, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { MultiUserSelect } from "@/components/ui/multi-user-select";
import { FilterMenu, type FilterFacet } from "@/components/ui/filter-menu";
import { facetMatches, type FilterValue } from "@/lib/filter-utils";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SkeletonList } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { HorizontalScrollbar } from "@/components/ui/horizontal-scrollbar";
import { useDragAutoScroll } from "@/hooks/use-drag-auto-scroll";
import { IconPlus, IconClock, IconUsers, IconPencil, IconTrash, IconBell } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "pipeline";

const VIEW_OPTIONS = [
  { value: "list", label: "List view" },
  { value: "pipeline", label: "Pipeline view" },
];

interface MeetingUser {
  id: string;
  name: string;
  surname?: string | null;
  email: string;
  role?: "SUPER_ADMIN" | "ADMIN" | "DEPARTMENT_USER" | null;
}

type MeetingStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  status: MeetingStatus;
  organizer: MeetingUser;
  attendees: MeetingUser[];
  remindAt: string | null;
}

const STATUS_OPTIONS = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_STYLE: Record<MeetingStatus, string> = {
  SCHEDULED: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  CANCELLED: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const isLink = (s: string) => /^https?:\/\//i.test(s.trim());

export function MeetingsView({ scope }: { scope?: "social-media" | "crm" | `team:${string}` } = {}) {
  const toast = useToast();
  const meetingsUrl = scope ? `/api/meetings?scope=${scope}` : "/api/meetings";
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [users, setUsers] = useState<MeetingUser[]>([]);
  const [meId, setMeId] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasMeetingsGrant, setHasMeetingsGrant] = useState(false);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  // The dialog stays mounted so it can animate closed, but it seeds its form
  // from the meeting at mount — so bump this on every open to remount it clean
  // rather than reopening onto the last visit's half-finished edits.
  const [openSeq, setOpenSeq] = useState(0);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Meeting | null>(null);
  const [filters, setFilters] = useState<{ organizer: FilterValue; status: FilterValue; involvement: FilterValue }>({
    organizer: null,
    status: null,
    involvement: null,
  });
  // Existing behavior (chronological Upcoming/Past sections) stays the
  // default — pipeline is opt-in via the toggle, not a replacement.
  const [view, setView] = useState<ViewMode>("list");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<MeetingStatus | null>(null);
  const { containerRef: scrollContainerRef, onDragOver: handleBoardDragOver, stop: stopAutoScroll } =
    useDragAutoScroll<HTMLDivElement>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, uRes, meRes] = await Promise.all([
        fetch(meetingsUrl),
        fetch("/api/users/assignable?scope=all"),
        fetch("/api/auth/me"),
      ]);
      const [mData, uData, meData] = await Promise.all([
        mRes.json().catch(() => ({})),
        uRes.json().catch(() => ({})),
        meRes.json().catch(() => ({})),
      ]);
      if (mRes.ok) {
        setMeetings(mData.meetings ?? []);
        setForbidden(false);
      } else if (scope && mRes.status === 403) {
        setForbidden(true);
      } else {
        toast.error("Couldn't load meetings", mData.error);
      }
      if (uRes.ok) setUsers(uData.users ?? []);
      if (meRes.ok) {
        setMeId(meData.user?.id ?? "");
        setIsAdmin(meData.user?.role === "SUPER_ADMIN" || meData.user?.role === "ADMIN");
        setHasMeetingsGrant(!!meData.user?.modulePermissions?.includes("MEETINGS"));
      }
    } catch {
      toast.error("Couldn't load meetings", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingsUrl]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredMeetings = useMemo(() => {
    return meetings.filter((m) => {
      if (!facetMatches(filters.organizer, (v) => m.organizer.id === v)) return false;
      if (!facetMatches(filters.status, (v) => m.status === v)) return false;
      // "Involving me" spans both roles: organiser or on the attendee list.
      if (
        !facetMatches(filters.involvement, (v) =>
          v === "mine" ? m.organizer.id === meId || m.attendees.some((a) => a.id === meId) : true
        )
      ) {
        return false;
      }
      return true;
    });
  }, [meetings, filters, meId]);

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const up: Meeting[] = [];
    const pa: Meeting[] = [];
    for (const m of filteredMeetings) {
      if (m.status === "SCHEDULED" && isAfter(parseISO(m.startsAt), now)) up.push(m);
      else pa.push(m);
    }
    up.sort((a, b) => a.startsAt.localeCompare(b.startsAt)); // soonest first
    pa.sort((a, b) => b.startsAt.localeCompare(a.startsAt)); // most recent first
    return { upcoming: up, past: pa };
  }, [filteredMeetings]);

  // The Social Media Team console gets multi-select within each facet;
  // everywhere else stays the original single-select behavior.
  const multiSelectFilters = !!scope;

  const filterFacets: FilterFacet[] = [
    {
      key: "organizer",
      label: "Organizer",
      allLabel: "Anyone",
      multiple: multiSelectFilters,
      value: filters.organizer,
      onChange: (v) => setFilters((f) => ({ ...f, organizer: v })),
      options: users.map((u) => ({ value: u.id, label: userOptionLabel(u), showAvatar: true })),
    },
    {
      key: "status",
      label: "Status",
      multiple: multiSelectFilters,
      value: filters.status,
      onChange: (v) => setFilters((f) => ({ ...f, status: v })),
      options: STATUS_OPTIONS,
    },
    {
      key: "involvement",
      label: "Involvement",
      allLabel: "Everyone's",
      multiple: multiSelectFilters,
      value: filters.involvement,
      onChange: (v) => setFilters((f) => ({ ...f, involvement: v })),
      options: [{ value: "mine", label: "Involving me" }],
    },
  ];

  function openCreate() {
    setEditing(null);
    setOpenSeq((n) => n + 1);
    setDialogOpen(true);
  }

  function openMeeting(m: Meeting) {
    setEditing(m);
    setOpenSeq((n) => n + 1);
    setDialogOpen(true);
  }

  // The organiser, admins, and a Meetings module grant can manage a meeting;
  // the API enforces the same.
  const fullAccess = isAdmin || hasMeetingsGrant;
  const canManageMeeting = (m: Meeting) => fullAccess || m.organizer.id === meId;

  async function remindMeeting(m: Meeting) {
    const res = await fetch(`/api/meetings/${m.id}/remind`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't send the reminder", data.error);
    toast.success("Reminder sent", `${m.title}`);
  }

  function meetingActions(m: Meeting): RowAction[] {
    const actions: RowAction[] = [];
    if (canManageMeeting(m)) {
      actions.push({ key: "edit", label: "Edit", icon: <IconPencil className="h-3.5 w-3.5" />, onSelect: () => openMeeting(m) });
    }
    if (fullAccess) {
      actions.push({ key: "remind", label: "Send reminder", icon: <IconBell className="h-3.5 w-3.5" />, onSelect: () => remindMeeting(m) });
    }
    if (canManageMeeting(m)) {
      actions.push({
        key: "delete",
        label: "Delete",
        icon: <IconTrash className="h-3.5 w-3.5" />,
        destructive: true,
        onSelect: () => setDeleteTarget(m),
      });
    }
    return actions;
  }

  async function deleteMeeting(id: string) {
    const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  /** Optimistic status update for a pipeline drag, rolled back if the PATCH fails — same pattern as leads-board.tsx's moveLead. */
  async function moveMeeting(meetingId: string, status: MeetingStatus) {
    const current = meetings.find((m) => m.id === meetingId);
    if (!current || current.status === status) return;

    setMeetings((prev) => prev.map((m) => (m.id === meetingId ? { ...m, status } : m)));

    const res = await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      setMeetings((prev) => prev.map((m) => (m.id === meetingId ? { ...m, status: current.status } : m)));
      const data = await res.json().catch(() => ({}));
      toast.error("Couldn't move the meeting", data.error);
    }
  }

  if (forbidden) {
    return (
      <Card className="flex flex-col items-center justify-center gap-1 py-16 text-center">
        <p className="text-sm font-medium">You don&apos;t have access to this team&apos;s Meetings</p>
        <p className="text-sm text-muted-foreground">Ask your team lead or a company admin for access.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Meetings</h1>
          <HelpDialog title="Meetings — help">
            <HelpSection heading="What this page is for">
              <p>Schedule meetings, invite attendees, and set a reminder — everyone invited gets a notification (and, if they turned it on, a push notification) ahead of time.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins">
              <p>See and manage every meeting across every department.</p>
            </HelpSection>
            <HelpSection heading="Department Admins & Permission Manager grants">
              <p>A Department Admin sees only what they&apos;re explicitly granted (Permission Manager → Meetings) — their own department by default, or every department if a company Admin turned on &quot;All departments&quot; for them.</p>
            </HelpSection>
            <HelpSection heading="Everyone else">
              <p>You see meetings you organized or were invited to.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex items-center gap-2">
          {meetings.length > 0 && (
            <>
              <Dropdown size="sm" value={view} onChange={(v) => setView(v as ViewMode)} options={VIEW_OPTIONS} className="w-40" />
              <FilterMenu facets={filterFacets} />
            </>
          )}
          <Button type="button" onClick={openCreate}>
            <IconPlus className="h-4 w-4" />
            New meeting
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center min-h-[55vh] flex-1 items-center">
          <SkeletonList rows={5} />
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">No meetings yet.</p>
            <Button type="button" variant="outline" onClick={openCreate}>
              <IconPlus className="h-4 w-4" />
              Schedule your first meeting
            </Button>
          </CardContent>
        </Card>
      ) : view === "pipeline" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          <div
            ref={scrollContainerRef}
            className="flex min-h-0 flex-1 gap-3 overflow-x-auto overflow-y-hidden focus:outline-none"
            onDragOver={handleBoardDragOver}
          >
            {STATUS_OPTIONS.map((col) => {
              const columnMeetings = filteredMeetings.filter((m) => m.status === col.value);
              const isDragOver = dragOverStatus === col.value;
              return (
                <div
                  key={col.value}
                  className={cn(
                    "flex min-h-0 w-72 shrink-0 flex-col gap-2 rounded-lg p-1.5 transition-colors",
                    isDragOver && "bg-accent/60"
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverStatus(col.value as MeetingStatus);
                  }}
                  onDragLeave={() => setDragOverStatus((s) => (s === col.value ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const meetingId = e.dataTransfer.getData("text/plain");
                    setDragOverStatus(null);
                    setDraggingId(null);
                    stopAutoScroll();
                    if (meetingId) moveMeeting(meetingId, col.value as MeetingStatus);
                  }}
                >
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{col.label}</span>
                    <span className="text-xs text-muted-foreground">{columnMeetings.length}</span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
                    {columnMeetings.map((m) => (
                      <Card
                        key={m.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", m.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(m.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStatus(null);
                          stopAutoScroll();
                        }}
                        onClick={() => openMeeting(m)}
                        className={cn(
                          "select-none cursor-grab p-3 text-left transition-colors hover:border-primary/40 active:cursor-grabbing",
                          draggingId === m.id && "opacity-30"
                        )}
                      >
                        <p className="line-clamp-2 text-sm font-medium">{m.title}</p>
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <IconClock className="h-3.5 w-3.5 shrink-0" />
                          <span>{format(parseISO(m.startsAt), "EEE, MMM d · h:mm a")}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <IconUsers className="h-3.5 w-3.5 shrink-0" />
                          <span>{m.organizer.id === meId ? "You" : m.organizer.name}</span>
                        </div>
                      </Card>
                    ))}
                    {columnMeetings.length === 0 && <p className="px-1 text-xs text-muted-foreground/60">No meetings</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <HorizontalScrollbar containerRef={scrollContainerRef} className="mx-1.5" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="Upcoming" meetings={upcoming} meId={meId} onOpen={openMeeting} actionsFor={meetingActions} emptyLabel="No upcoming meetings." />
          <Section title="Past & closed" meetings={past} meId={meId} onOpen={openMeeting} actionsFor={meetingActions} emptyLabel="Nothing here yet." />
        </div>
      )}

      <MeetingDialog
        key={openSeq}
        open={dialogOpen}
        meeting={editing}
        users={users}
        canManage={!editing || fullAccess || editing.organizer.id === meId}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          load();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.title}"?`}
        description="This permanently removes the meeting for everyone."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteTarget) await deleteMeeting(deleteTarget.id);
        }}
      />
    </div>
  );
}

function Section({
  title,
  meetings,
  meId,
  onOpen,
  actionsFor,
  emptyLabel,
}: {
  title: string;
  meetings: Meeting[];
  meId: string;
  onOpen: (m: Meeting) => void;
  actionsFor: (m: Meeting) => RowAction[];
  emptyLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted-foreground">
        {title} <span className="tabular-nums">({meetings.length})</span>
      </p>
      {meetings.length === 0 ? (
        <p className="px-1 py-3 text-sm text-muted-foreground/70">{emptyLabel}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {meetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} meId={meId} onOpen={onOpen} actions={actionsFor(m)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingCard({
  meeting: m,
  meId,
  onOpen,
  actions,
}: {
  meeting: Meeting;
  meId: string;
  onOpen: (m: Meeting) => void;
  actions: RowAction[];
}) {
  const start = parseISO(m.startsAt);
  const end = m.endsAt ? parseISO(m.endsAt) : null;
  return (
    // A div, not a button: the actions menu is itself a button and can't nest
    // inside one. role/tabIndex keep it keyboard-openable.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(m)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(m);
        }
      }}
      className="group flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card/40 p-4 text-left transition-colors hover:border-ring/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{m.title}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[m.status])}>
            {m.status.charAt(0) + m.status.slice(1).toLowerCase()}
          </span>
          {actions.length > 0 && (
            <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <RowActionsMenu actions={actions} label={`Actions for ${m.title}`} />
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <IconClock className="h-3.5 w-3.5 shrink-0" />
        <span>
          {format(start, "EEE, MMM d · h:mm a")}
          {end ? ` – ${format(end, "h:mm a")}` : ""}
        </span>
      </div>
      {m.location && (
        <p className="truncate text-sm text-muted-foreground">
          📍 {isLink(m.location) ? <span className="text-primary underline">{m.location}</span> : m.location}
        </p>
      )}
      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <IconUsers className="h-3.5 w-3.5 shrink-0" />
        <span>
          {m.organizer.id === meId ? "You" : m.organizer.name} · {m.attendees.length} attendee
          {m.attendees.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

function MeetingDialog({
  open,
  meeting,
  users,
  canManage,
  onClose,
  onSaved,
}: {
  open: boolean;
  meeting: Meeting | null;
  users: MeetingUser[];
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editingId = meeting?.id ?? null;
  const readOnly = !canManage;

  const [title, setTitle] = useState(meeting?.title ?? "");
  const [description, setDescription] = useState(meeting?.description ?? "");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [startsAt, setStartsAt] = useState<Date | null>(meeting ? parseISO(meeting.startsAt) : defaultStart());
  const [endsAt, setEndsAt] = useState<Date | null>(meeting?.endsAt ? parseISO(meeting.endsAt) : null);
  const [remindAt, setRemindAt] = useState<Date | null>(meeting?.remindAt ? parseISO(meeting.remindAt) : null);
  const [status, setStatus] = useState<MeetingStatus>(meeting?.status ?? "SCHEDULED");
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set(meeting?.attendees.map((a) => a.id) ?? []));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save() {
    if (!title.trim()) return toast.error("Title is required");
    if (!startsAt) return toast.error("Start time is required");
    if (endsAt && endsAt < startsAt) return toast.error("End time must be after the start time");
    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt ? endsAt.toISOString() : null,
        attendeeIds: [...attendeeIds],
        status,
        remindAt: remindAt ? remindAt.toISOString() : null,
      };
      const res = await fetch(editingId ? `/api/meetings/${editingId}` : "/api/meetings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save the meeting", data.error);
      toast.success(editingId ? "Meeting updated" : "Meeting scheduled");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/${editingId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return toast.error("Couldn't delete the meeting", data.error);
      }
      toast.success("Meeting deleted");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        // A meeting form can hold a fair bit of typed-in agenda/notes — an
        // accidental click on the overlay while working shouldn't discard it.
        // Still closes via the X button, Escape, or Cancel/Save.
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{editingId ? (readOnly ? "Meeting details" : "Edit meeting") : "New meeting"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-title">Title</Label>
              <Input id="m-title" value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly sync" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-desc">Agenda / notes</Label>
              <Textarea id="m-desc" value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} placeholder="What's this meeting about?" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Starts</Label>
                <DateTimePicker value={startsAt} onChange={setStartsAt} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Ends (optional)</Label>
                <DateTimePicker value={endsAt} onChange={setEndsAt} placeholder="—" clearable onClear={() => setEndsAt(null)} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m-loc">Location or link</Label>
              <Input id="m-loc" value={location} disabled={readOnly} onChange={(e) => setLocation(e.target.value)} placeholder="Meeting room 2, or https://meet.…" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Remind me at</Label>
              <DateTimePicker value={remindAt} onChange={setRemindAt} placeholder="No reminder" clearable onClear={() => setRemindAt(null)} />
              <p className="text-xs text-muted-foreground">
                Notifies the organizer and every attendee — toast, bell, and a push notification if the app is closed.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Dropdown value={status} disabled={readOnly} onChange={(v) => setStatus(v as MeetingStatus)} options={STATUS_OPTIONS} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Attendees ({attendeeIds.size})</Label>
              <MultiUserSelect users={users} selectedIds={[...attendeeIds]} onChange={(ids) => setAttendeeIds(new Set(ids))} disabled={readOnly} />
            </div>
          </div>
        </DialogBody>

        {!readOnly && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            {editingId ? (
              <Button type="button" variant="outline" disabled={saving} onClick={() => setConfirmDelete(true)} className="text-destructive">
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" disabled={saving} onClick={save}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Schedule meeting"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete meeting?"
        description="This permanently removes the meeting for everyone."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </Dialog>
  );
}

/** Next full hour, as a sensible default start time. */
function defaultStart() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}
