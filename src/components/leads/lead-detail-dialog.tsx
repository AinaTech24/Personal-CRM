"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { IconTrash } from "@/components/icons";
import {
  LEAD_STATUSES,
  MEETING_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  type AssignableUser,
  type LeadDetail,
  type LeadStatus,
  type LeadSummary,
  type MeetingStatus,
  type Priority,
} from "@/components/leads/types";

function formatDate(d: string) {
  return new Date(d).toLocaleString();
}

function activityLabel(a: { action: string; meta: Record<string, unknown> | null; actor: { name: string } }) {
  switch (a.action) {
    case "created":
      return `${a.actor.name} created this lead`;
    case "status_changed":
      return `${a.actor.name} changed status: ${a.meta?.from} → ${a.meta?.to}`;
    case "assigned":
      return `${a.actor.name} updated assignment`;
    case "note_added":
      return `${a.actor.name} added a note`;
    case "reminder_added":
      return `${a.actor.name} added a reminder`;
    default:
      return `${a.actor.name}: ${a.action}`;
  }
}

function SkeletonBar({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-accent/60 ${className ?? ""}`} />;
}

export function LeadDetailDialog({
  leadId,
  initialSummary,
  assignableUsers,
  onClose,
  onChanged,
  onDeleted,
}: {
  leadId: string | null;
  initialSummary?: LeadSummary | null;
  assignableUsers: AssignableUser[];
  onClose: () => void;
  onChanged: () => void;
  onDeleted?: () => void;
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [reminderDue, setReminderDue] = useState<Date | null>(null);
  const [reminderNote, setReminderNote] = useState("");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  async function load() {
    if (!leadId) return;
    const res = await fetch(`/api/leads/${leadId}`);
    const data = await res.json();
    if (res.ok) setLead(data.lead);
  }

  useEffect(() => {
    setLead(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function patchLead(fields: Record<string, unknown>) {
    if (!leadId) return;
    setSavingField(Object.keys(fields)[0]);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (res.ok) {
        await load();
        onChanged();
      }
    } finally {
      setSavingField(null);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId || !noteBody.trim()) return;
    const res = await fetch(`/api/leads/${leadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: noteBody }),
    });
    if (res.ok) {
      setNoteBody("");
      await load();
    }
  }

  async function addReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!leadId || !reminderDue) return;
    const res = await fetch(`/api/leads/${leadId}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueAt: reminderDue.toISOString(), note: reminderNote || null }),
    });
    if (res.ok) {
      setReminderDue(null);
      setReminderNote("");
      await load();
    }
  }

  async function completeReminder(reminderId: string) {
    if (!leadId) return;
    const res = await fetch(`/api/leads/${leadId}/reminders/${reminderId}`, { method: "PATCH" });
    if (res.ok) await load();
  }

  async function deleteLead() {
    if (!leadId) return;
    const res = await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    if (res.ok) onDeleted?.();
  }

  const headerName = lead?.name ?? initialSummary?.name;
  const headerCompany = lead?.company ?? initialSummary?.company;
  const headerDepartment = lead?.department ?? initialSummary?.department;

  return (
    <>
    <Dialog open={!!leadId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{headerName ?? " "}</DialogTitle>
          <DialogDescription>
            {headerCompany ?? "No company"} {headerDepartment ? `· ${headerDepartment.name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
        {!lead ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SkeletonBar className="h-8" />
              <SkeletonBar className="h-8" />
              <SkeletonBar className="col-span-2 h-8" />
            </div>
            <SkeletonBar className="h-16" />
            <SkeletonBar className="h-24" />
            <SkeletonBar className="h-24" />
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex flex-col gap-4"
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Status</span>
                <Dropdown
                  size="sm"
                  value={lead.status}
                  disabled={savingField === "status"}
                  onChange={(v) => patchLead({ status: v as LeadStatus })}
                  options={LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Priority</span>
                <Dropdown
                  size="sm"
                  value={lead.priority}
                  disabled={savingField === "priority"}
                  onChange={(v) => patchLead({ priority: v as Priority })}
                  options={PRIORITY_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Assigned to</span>
                <Dropdown
                  size="sm"
                  value={lead.assignedTo?.id ?? ""}
                  disabled={savingField === "assignedToId"}
                  onChange={(v) => patchLead({ assignedToId: v || null })}
                  placeholder="Unassigned"
                  options={assignableUsers.map((u) => ({ value: u.id, label: u.name, avatarDataUrl: u.avatarDataUrl, showAvatar: true }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
              {lead.email && <div>Email: {lead.email}</div>}
              {lead.phone && <div>Phone: {lead.phone}</div>}
              {lead.source && <div>Source: {lead.source}</div>}
              {lead.product && <div>Product: {lead.product}</div>}
              <div>Created by {lead.createdBy.name}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Lead arrive date</span>
                <DateTimePicker
                  value={lead.leadArriveDate ? new Date(lead.leadArriveDate) : null}
                  onChange={(d) => patchLead({ leadArriveDate: d.toISOString() })}
                  placeholder="Not set"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Meeting date</span>
                <DateTimePicker
                  value={lead.meetingDate ? new Date(lead.meetingDate) : null}
                  onChange={(d) => patchLead({ meetingDate: d.toISOString() })}
                  placeholder="Not set"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
                <span className="text-xs text-muted-foreground">Meeting status</span>
                <Dropdown
                  size="sm"
                  value={lead.meetingStatus ?? ""}
                  disabled={savingField === "meetingStatus"}
                  onChange={(v) => patchLead({ meetingStatus: (v || null) as MeetingStatus | null })}
                  placeholder="Not set"
                  options={MEETING_STATUS_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h4 className="text-sm font-medium">Notes</h4>
              <form onSubmit={addNote} className="flex gap-2">
                <Textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Add a note..."
                  className="min-h-9"
                />
                <Button type="submit" size="sm" className="shrink-0 self-start">
                  Add
                </Button>
              </form>
              <div className="flex flex-col gap-2">
                {lead.notes.length === 0 && (
                  <p className="text-xs text-muted-foreground">No notes yet</p>
                )}
                {lead.notes.map((n) => (
                  <div key={n.id} className="rounded-md bg-accent/50 p-2 text-sm">
                    <p>{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.author.name} · {formatDate(n.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h4 className="text-sm font-medium">Reminders</h4>
              <form onSubmit={addReminder} className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <DateTimePicker
                    className="w-44 shrink-0"
                    value={reminderDue}
                    onChange={setReminderDue}
                    placeholder="Due date"
                  />
                  <Input
                    value={reminderNote}
                    onChange={(e) => setReminderNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="min-w-0 flex-1"
                  />
                  <Button type="submit" size="sm" className="shrink-0">
                    Add
                  </Button>
                </div>
              </form>
              <div className="flex flex-col gap-2">
                {lead.reminders.length === 0 && (
                  <p className="text-xs text-muted-foreground">No reminders yet</p>
                )}
                {lead.reminders.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md bg-accent/50 p-2 text-sm">
                    <div>
                      <p className={r.completedAt ? "line-through text-muted-foreground" : ""}>
                        {formatDate(r.dueAt)} {r.note ? `· ${r.note}` : ""}
                      </p>
                    </div>
                    {!r.completedAt && (
                      <Button size="sm" variant="outline" onClick={() => completeReminder(r.id)}>
                        Mark done
                      </Button>
                    )}
                    {r.completedAt && <Badge variant="success">Done</Badge>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <h4 className="text-sm font-medium">Activity</h4>
              <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
                {lead.activities.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{activityLabel(a)}</span>
                    <span className="shrink-0">{formatDate(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
        </DialogBody>
        <DialogFooter>
          <Tooltip label="Delete lead">
            <button
              type="button"
              aria-label="Delete lead"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition-opacity hover:text-destructive hover:opacity-100"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </Tooltip>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={deleteConfirmOpen}
      onOpenChange={setDeleteConfirmOpen}
      title={`Delete "${headerName ?? "this lead"}"?`}
      description="This will permanently delete this lead along with its notes, reminders, and activity history. This action cannot be undone."
      onConfirm={deleteLead}
    />
    </>
  );
}
