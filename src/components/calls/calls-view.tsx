"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { SkeletonList } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { IconPlus, IconClock, IconPencil, IconTrash } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { cn } from "@/lib/utils";

type CallType = "INCOMING" | "OUTGOING" | "MISSED";

interface CallLead {
  id: string;
  name: string;
  company: string | null;
}

interface CallUser {
  id: string;
  name: string;
}

interface Call {
  id: string;
  lead: CallLead | null;
  clientName: string | null;
  callType: CallType;
  startTime: string;
  endTime: string | null;
  owner: CallUser;
  createdBy: CallUser;
  nextAction: string | null;
  subject: string | null;
  description: string | null;
}

const CALL_TYPE_OPTIONS = [
  { value: "INCOMING", label: "Incoming" },
  { value: "OUTGOING", label: "Outgoing" },
  { value: "MISSED", label: "Missed" },
];

const CALL_TYPE_STYLE: Record<CallType, string> = {
  INCOMING: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  OUTGOING: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  MISSED: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function CallsView({ scope }: { scope?: "crm" } = {}) {
  const callsUrl = scope ? `/api/calls?scope=${scope}` : "/api/calls";
  const [calls, setCalls] = useState<Call[]>([]);
  const [leads, setLeads] = useState<CallLead[]>([]);
  const [users, setUsers] = useState<CallUser[]>([]);
  const [meId, setMeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [openSeq, setOpenSeq] = useState(0);
  const [editing, setEditing] = useState<Call | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Call | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, lRes, uRes, meRes] = await Promise.all([
        fetch(callsUrl),
        fetch("/api/leads"),
        fetch("/api/users/assignable?scope=all"),
        fetch("/api/auth/me"),
      ]);
      const [cData, lData, uData, meData] = await Promise.all([cRes.json(), lRes.json(), uRes.json(), meRes.json()]);
      setCalls(cData.calls ?? []);
      setLeads(lData.leads ?? []);
      setUsers(uData.users ?? []);
      if (meRes.ok) setMeId(meData.user?.id ?? "");
    } finally {
      setLoading(false);
    }
  }, [callsUrl]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setOpenSeq((n) => n + 1);
    setDialogOpen(true);
  }

  function openCall(c: Call) {
    setEditing(c);
    setOpenSeq((n) => n + 1);
    setDialogOpen(true);
  }

  function callActions(c: Call): RowAction[] {
    return [
      { key: "edit", label: "Edit", icon: <IconPencil className="h-3.5 w-3.5" />, onSelect: () => openCall(c) },
      {
        key: "delete",
        label: "Delete",
        icon: <IconTrash className="h-3.5 w-3.5" />,
        destructive: true,
        onSelect: () => setDeleteTarget(c),
      },
    ];
  }

  async function deleteCall(id: string) {
    const res = await fetch(`/api/calls/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Calls</h1>
          <HelpDialog title="Calls — help">
            <HelpSection heading="What this page is for">
              <p>Log incoming, outgoing, and missed calls against a lead or a named contact, so there&apos;s a record of who talked to whom and when.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins and CRM Team leads">
              <p>See every call logged by anyone on the CRM team.</p>
            </HelpSection>
            <HelpSection heading="Everyone else">
              <p>You see calls you personally logged.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        <Button type="button" onClick={openCreate}>
          <IconPlus className="h-4 w-4" />
          Log a call
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center min-h-[40vh] flex-1 items-center">
          <SkeletonList rows={5} />
        </div>
      ) : calls.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">No calls logged yet.</p>
            <Button type="button" variant="outline" onClick={openCreate}>
              <IconPlus className="h-4 w-4" />
              Log your first call
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Subject</th>
                  <th className="px-4 py-2.5 font-medium">Lead / Client</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium">Next action</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr
                    key={c.id}
                    className="group cursor-pointer border-b border-border last:border-b-0 hover:bg-primary/5"
                    onClick={() => openCall(c)}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <IconClock className="h-3.5 w-3.5 shrink-0" />
                        {format(parseISO(c.startTime), "MMM d, h:mm a")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", CALL_TYPE_STYLE[c.callType])}>
                        {c.callType.charAt(0) + c.callType.slice(1).toLowerCase()}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5">{c.subject || "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {c.lead ? c.lead.name : c.clientName || "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.owner.id === meId ? "You" : c.owner.name}</td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-muted-foreground">{c.nextAction || "—"}</td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <span className="opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <RowActionsMenu actions={callActions(c)} label={`Actions for call with ${c.lead?.name ?? c.clientName ?? "unknown"}`} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CallDialog
        key={openSeq}
        open={dialogOpen}
        call={editing}
        leads={leads}
        users={users}
        meId={meId}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          load();
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete this call log?"
        description="This permanently removes the call record."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteTarget) await deleteCall(deleteTarget.id);
        }}
      />
    </div>
  );
}

function CallDialog({
  open,
  call,
  leads,
  users,
  meId,
  onClose,
  onSaved,
}: {
  open: boolean;
  call: Call | null;
  leads: CallLead[];
  users: CallUser[];
  meId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const editingId = call?.id ?? null;

  const [leadId, setLeadId] = useState(call?.lead?.id ?? "");
  const [clientName, setClientName] = useState(call?.clientName ?? "");
  const [callType, setCallType] = useState<CallType>(call?.callType ?? "OUTGOING");
  const [startTime, setStartTime] = useState<Date | null>(call ? parseISO(call.startTime) : new Date());
  const [endTime, setEndTime] = useState<Date | null>(call?.endTime ? parseISO(call.endTime) : null);
  const [ownerId, setOwnerId] = useState(call?.owner.id ?? meId);
  const [nextAction, setNextAction] = useState(call?.nextAction ?? "");
  const [subject, setSubject] = useState(call?.subject ?? "");
  const [description, setDescription] = useState(call?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const leadOptions = [{ value: "", label: "None" }, ...leads.map((l) => ({ value: l.id, label: l.company ? `${l.name} (${l.company})` : l.name }))];
  const ownerOptions = users.map((u) => ({ value: u.id, label: u.id === meId ? `${u.name} (You)` : u.name }));

  async function save() {
    if (!startTime) return toast.error("Start time is required");
    if (!ownerId) return toast.error("Call owner is required");
    if (!leadId && !clientName.trim()) return toast.error("Pick a lead or enter a client name");
    setSaving(true);
    try {
      const body = {
        leadId: leadId || null,
        clientName: clientName.trim() || null,
        callType,
        startTime: startTime.toISOString(),
        endTime: endTime ? endTime.toISOString() : null,
        ownerId,
        nextAction: nextAction.trim() || null,
        subject: subject.trim() || null,
        description: description.trim() || null,
      };
      const res = await fetch(editingId ? `/api/calls/${editingId}` : "/api/calls", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't save the call", data.error);
      toast.success(editingId ? "Call updated" : "Call logged");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/calls/${editingId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return toast.error("Couldn't delete the call", data.error);
      }
      toast.success("Call deleted");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit call" : "Log a call"}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Lead</Label>
                <Dropdown value={leadId} onChange={setLeadId} options={leadOptions} placeholder="None" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="call-client">Client</Label>
                <Input
                  id="call-client"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client name (if not tracked as a lead)"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Call type</Label>
                <Dropdown value={callType} onChange={(v) => setCallType(v as CallType)} options={CALL_TYPE_OPTIONS} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Call owner</Label>
                <Dropdown value={ownerId} onChange={setOwnerId} options={ownerOptions} placeholder="Choose a user" />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Start time</Label>
                <DateTimePicker value={startTime} onChange={setStartTime} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>End time (optional)</Label>
                <DateTimePicker value={endTime} onChange={setEndTime} placeholder="—" clearable onClear={() => setEndTime(null)} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="call-subject">Subject</Label>
              <Input id="call-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What was this call about?" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="call-next-action">Next action</Label>
              <Textarea
                id="call-next-action"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                rows={2}
                placeholder="Follow up next Tuesday, send a proposal, etc."
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="call-description">Description</Label>
              <Textarea
                id="call-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Notes from the call"
              />
            </div>
          </div>
        </DialogBody>

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
              {saving ? "Saving..." : editingId ? "Save changes" : "Log call"}
            </Button>
          </div>
        </div>
      </DialogContent>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this call log?"
        description="This permanently removes the call record."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </Dialog>
  );
}
