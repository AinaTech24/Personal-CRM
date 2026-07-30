"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTrash } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { userOptionLabel } from "@/lib/user-display";

interface Member {
  userId: string;
  isLead: boolean;
  user: { id: string; name: string; surname: string | null; email: string };
}

interface UserRow {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  role: string;
}

export default function AdminSocialMediaPage() {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [addUserId, setAddUserId] = useState("");
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  async function load() {
    const [membersRes, usersRes] = await Promise.all([fetch("/api/social/members"), fetch("/api/users")]);
    const [membersData, usersData] = await Promise.all([membersRes.json(), usersRes.json()]);
    if (membersRes.ok) setMembers(membersData.members);
    if (usersRes.ok) setUsers(usersData.users);
  }

  useEffect(() => {
    load();
  }, []);

  const memberIds = new Set(members.map((m) => m.userId));
  const candidateOptions = users.filter((u) => !memberIds.has(u.id)).map((u) => ({ value: u.id, label: userOptionLabel(u) }));

  async function addMember() {
    if (!addUserId) return;
    setAdding(true);
    try {
      const res = await fetch("/api/social/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: addUserId }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error("Couldn't add member", data.error);
      setAddUserId("");
      toast.success("Added to Social Media team");
      load();
    } finally {
      setAdding(false);
    }
  }

  async function toggleLead(member: Member, isLead: boolean) {
    setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, isLead } : m)));
    const res = await fetch(`/api/social/members/${member.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLead }),
    });
    if (!res.ok) {
      setMembers((prev) => prev.map((m) => (m.userId === member.userId ? { ...m, isLead: member.isLead } : m)));
      toast.error("Couldn't update");
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const res = await fetch(`/api/social/members/${removeTarget.userId}`, { method: "DELETE" });
    if (!res.ok) return toast.error("Couldn't remove member");
    toast.success(`${removeTarget.user.name} removed from Social Media team`);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Social Media Team</h1>
        <p className="text-sm text-muted-foreground">
          Only members listed here (plus Admin/Super Admin) can see the Social Media module. A lead sees and manages
          every client; a regular member only sees their own.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-5">
          <div className="w-64">
            <Dropdown value={addUserId} onChange={setAddUserId} placeholder="Choose a user" options={candidateOptions} />
          </div>
          <Button size="sm" onClick={addMember} disabled={!addUserId || adding}>
            {adding ? "Adding..." : "Add to team"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Lead (sees everyone&apos;s clients)</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No one&apos;s on the Social Media team yet.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr key={m.userId} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5 font-medium">{m.user.name} {m.user.surname ?? ""}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{m.user.email}</td>
                    <td className="px-4 py-2.5">
                      <ToggleSwitch checked={m.isLead} onChange={(v) => toggleLead(m, v)} label={`Toggle lead for ${m.user.name}`} />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        aria-label={`Remove ${m.user.name}`}
                        onClick={() => setRemoveTarget(m)}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/5 hover:text-destructive"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(v) => !v && setRemoveTarget(null)}
        title={`Remove ${removeTarget?.user.name} from the Social Media team?`}
        description="They'll lose access to the module immediately. Clients they created or are assigned to stay as they are."
        onConfirm={confirmRemove}
      />
    </div>
  );
}
