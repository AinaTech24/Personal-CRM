"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, isAfter, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { EightDotsRotate } from "@/components/ui/loader";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconPlus, IconClock, IconUsers } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";

interface MeetingUser {
  id: string;
  name: string;
  email: string;
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

export function MeetingsView() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [users, setUsers] = useState<MeetingUser[]>([]);
  const [meId, setMeId] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, uRes, meRes] = await Promise.all([
        fetch("/api/meetings"),
        fetch("/api/users/assignable?scope=all"),
        fetch("/api/auth/me"),
      ]);
      const [mData, uData, meData] = await Promise.all([mRes.json(), uRes.json(), meRes.json()]);
      setMeetings(mData.meetings ?? []);
      setUsers(uData.users ?? []);
      if (meRes.ok) {
        setMeId(meData.user?.id ?? "");
        setIsAdmin(meData.user?.role === "SUPER_ADMIN" || meData.user?.role === "ADMIN");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const now = new Date();
    const up: Meeting[] = [];
    const pa: Meeting[] = [];
    for (const m of meetings) {
      if (m.status === "SCHEDULED" && isAfter(parseISO(m.startsAt), now)) up.push(m);
      else pa.push(m);
    }
    up.sort((a, b) => a.startsAt.localeCompare(b.startsAt)); // soonest first
    pa.sort((a, b) => b.startsAt.localeCompare(a.startsAt)); // most recent first
    return { upcoming: up, past: pa };
  }, [meetings]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openMeeting(m: Meeting) {
    setEditing(m);
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Meetings</h1>
          <p className="text-sm text-muted-foreground">Schedule and track team meetings.</p>
        </div>
        <Button type="button" onClick={openCreate}>
          <IconPlus className="h-4 w-4" />
          New meeting
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <EightDotsRotate className="h-9 w-9" />
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
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="Upcoming" meetings={upcoming} meId={meId} onOpen={openMeeting} emptyLabel="No upcoming meetings." />
          <Section title="Past & closed" meetings={past} meId={meId} onOpen={openMeeting} emptyLabel="Nothing here yet." />
        </div>
      )}

      {dialogOpen && (
        <MeetingDialog
          meeting={editing}
          users={users}
          canManage={!editing || isAdmin || editing.organizer.id === meId}
          onClose={() => setDialogOpen(false)}
          onSaved={() => {
            setDialogOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Section({
  title,
  meetings,
  meId,
  onOpen,
  emptyLabel,
}: {
  title: string;
  meetings: Meeting[];
  meId: string;
  onOpen: (m: Meeting) => void;
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
            <MeetingCard key={m.id} meeting={m} meId={meId} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting: m, meId, onOpen }: { meeting: Meeting; meId: string; onOpen: (m: Meeting) => void }) {
  const start = parseISO(m.startsAt);
  const end = m.endsAt ? parseISO(m.endsAt) : null;
  return (
    <button
      type="button"
      onClick={() => onOpen(m)}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-4 text-left transition-colors hover:border-ring/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{m.title}</p>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[m.status])}>
          {m.status.charAt(0) + m.status.slice(1).toLowerCase()}
        </span>
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
    </button>
  );
}

function MeetingDialog({
  meeting,
  users,
  canManage,
  onClose,
  onSaved,
}: {
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
  const [status, setStatus] = useState<MeetingStatus>(meeting?.status ?? "SCHEDULED");
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set(meeting?.attendees.map((a) => a.id) ?? []));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
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
              <Label>Status</Label>
              <Dropdown value={status} disabled={readOnly} onChange={(v) => setStatus(v as MeetingStatus)} options={STATUS_OPTIONS} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Attendees ({attendeeIds.size})</Label>
              <div className="max-h-52 overflow-y-auto rounded-md border border-border">
                {users.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No users to add.</p>
                ) : (
                  users.map((u) => (
                    <label
                      key={u.id}
                      className={cn(
                        "flex items-center gap-3 border-b border-border/50 px-3 py-2 last:border-0",
                        !readOnly && "cursor-pointer hover:bg-accent/50"
                      )}
                    >
                      <Checkbox
                        checked={attendeeIds.has(u.id)}
                        onChange={() => !readOnly && toggleAttendee(u.id)}
                        aria-label={`Toggle ${u.name}`}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{u.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
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
