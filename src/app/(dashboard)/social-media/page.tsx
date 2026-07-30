"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowActionsMenu, type RowAction } from "@/components/ui/row-actions";
import { IconPlus, IconPencil, IconTrash } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { useSocket } from "@/components/providers/socket-provider";
import { userOptionLabel } from "@/lib/user-display";

const STAGE_OPTIONS = [
  { value: "ENQUIRY", label: "Enquiry" },
  { value: "CALLING", label: "Calling" },
  { value: "MEETING", label: "Meeting" },
  { value: "PLAN_DISCUSSION", label: "Plan Discussion" },
  { value: "APPROVAL", label: "Approval" },
  { value: "ONBOARDED", label: "Onboarded" },
];

interface ClientRow {
  id: string;
  name: string;
  companyName: string | null;
  stage: string;
  assignedTo: { id: string; name: string } | null;
  createdBy: { id: string; name: string };
  _count: { contentItems: number; adCampaigns: number };
}

interface AssignableUser {
  id: string;
  name: string;
  surname?: string | null;
  role?: "SUPER_ADMIN" | "ADMIN" | "DEPARTMENT_USER" | null;
}

export default function SocialMediaPage() {
  const toast = useToast();
  const router = useRouter();
  const { socket } = useSocket();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [isLead, setIsLead] = useState(false);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [planNotes, setPlanNotes] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [clientsRes, usersRes, meRes] = await Promise.all([
        fetch("/api/social/clients"),
        fetch("/api/users/assignable?scope=all"),
        fetch("/api/auth/me"),
      ]);
      const [clientsData, usersData, meData] = await Promise.all([clientsRes.json(), usersRes.json(), meRes.json()]);
      if (clientsRes.ok) setClients(clientsData.clients);
      if (usersRes.ok) setAssignableUsers(usersData.users);
      if (meRes.ok) setIsLead(!!meData.user?.socialMedia?.isLead);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const events = ["social_client_created", "social_client_updated", "social_client_deleted"];
    const handler = () => load();
    events.forEach((e) => socket.on(e, handler));
    return () => events.forEach((e) => socket.off(e, handler));
  }, [socket]);

  function openCreate() {
    setName("");
    setCompanyName("");
    setContactPerson("");
    setPhone("");
    setEmail("");
    setPlanNotes("");
    setAssignedToId("");
    setCreateOpen(true);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/social/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          companyName: companyName || null,
          contactPerson: contactPerson || null,
          phone: phone || null,
          email: email || null,
          planNotes: planNotes || null,
          assignedToId: assignedToId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't create client", data.error);
      setCreateOpen(false);
      toast.success("Client created", name);
      load();
    } finally {
      setCreating(false);
    }
  }

  async function changeStage(client: ClientRow, stage: string) {
    setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, stage } : c)));
    const res = await fetch(`/api/social/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, stage: client.stage } : c)));
      toast.error("Couldn't update stage");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/social/clients/${deleteTarget.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("Couldn't delete client", data.error);
      return;
    }
    toast.success(`${deleteTarget.name} deleted`);
    load();
  }

  function rowActions(client: ClientRow): RowAction[] {
    const actions: RowAction[] = [
      { key: "open", label: "Open", icon: <IconPencil className="h-3.5 w-3.5" />, onSelect: () => router.push(`/social-media/${client.id}`) },
    ];
    if (isLead) {
      actions.push({
        key: "delete",
        label: "Delete",
        icon: <IconTrash className="h-3.5 w-3.5" />,
        destructive: true,
        onSelect: () => setDeleteTarget(client),
      });
    }
    return actions;
  }

  const userOptions = assignableUsers.map((u) => ({ value: u.id, label: userOptionLabel(u) }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Social Media</h1>
          <p className="text-sm text-muted-foreground">
            {clients.length} client{clients.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openCreate}>
          <IconPlus className="h-4 w-4" />
          New client
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">Assigned to</th>
                <th className="px-4 py-2.5 font-medium">Content</th>
                <th className="px-4 py-2.5 font-medium">Ads</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {!loading && clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No clients yet. Add the first one to start the onboarding flow.
                  </td>
                </tr>
              )}
              {clients.map((client) => (
                <tr
                  key={client.id}
                  onClick={() => router.push(`/social-media/${client.id}`)}
                  className="group cursor-pointer border-b border-border last:border-b-0 hover:bg-primary/5"
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{client.name}</p>
                    {client.companyName && <p className="text-xs text-muted-foreground">{client.companyName}</p>}
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="w-44">
                      <Dropdown
                        size="sm"
                        value={client.stage}
                        onChange={(v) => changeStage(client, v)}
                        options={STAGE_OPTIONS}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{client.assignedTo?.name ?? "Unassigned"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{client._count.contentItems}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{client._count.adCampaigns}</td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <span className="flex justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <RowActionsMenu actions={rowActions(client)} label={`Actions for ${client.name}`} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New social media client</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="new-social-client" onSubmit={submitCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sm-name">Name</Label>
                <Input id="sm-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sm-company">Company</Label>
                <Input id="sm-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sm-contact">Contact person</Label>
                  <Input id="sm-contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sm-phone">Phone</Label>
                  <Input id="sm-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sm-email">Email</Label>
                <Input id="sm-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sm-assigned">Assigned to</Label>
                <Dropdown id="sm-assigned" value={assignedToId} onChange={setAssignedToId} placeholder="Unassigned" options={userOptions} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sm-notes">Plan notes</Label>
                <Textarea id="sm-notes" value={planNotes} onChange={(e) => setPlanNotes(e.target.value)} rows={3} />
              </div>
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="submit" form="new-social-client" disabled={creating}>
              {creating ? "Creating..." : "Create client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name}?`}
        description="This permanently removes the client along with its platform accounts, content, ad campaigns, and reports. This cannot be undone."
        onConfirm={confirmDelete}
      />
    </div>
  );
}
