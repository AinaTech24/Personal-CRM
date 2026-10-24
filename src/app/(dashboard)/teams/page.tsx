"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { useToast } from "@/components/providers/toast-provider";
import { IconPencil, IconTrash, IconPlus, IconPower } from "@/components/icons";

interface Team {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  disabled: boolean;
  memberCount: number;
}

/** Social Media and CRM keep their own dedicated consoles — clicking those entries here goes straight there instead of the generic team page. */
const SYSTEM_TEAM_HREF: Record<string, string> = {
  "social-media": "/social-media/team",
  crm: "/crm/team",
};

export default function TeamsPage() {
  const router = useRouter();
  const toast = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [renaming, setRenaming] = useState<Team | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [deleting, setDeleting] = useState<Team | null>(null);

  async function load() {
    const [teamsRes, meRes] = await Promise.all([fetch("/api/teams"), fetch("/api/auth/me")]);
    const teamsData = await teamsRes.json();
    if (teamsRes.ok) setTeams(teamsData.teams);
    if (meRes.ok) {
      const me = (await meRes.json()).user;
      setIsAdmin(me?.role === "SUPER_ADMIN" || me?.role === "ADMIN");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setName("");
    setError(null);
    setCreateOpen(true);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setCreateOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function openRename(t: Team) {
    setRenaming(t);
    setRenameValue(t.name);
  }

  async function saveRename() {
    if (!renaming || !renameValue.trim()) return;
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/teams/${renaming.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't rename the team", data.error);
      toast.success("Team renamed");
      setRenaming(null);
      load();
    } finally {
      setRenameSaving(false);
    }
  }

  async function toggleDisabled(t: Team) {
    const res = await fetch(`/api/teams/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled: !t.disabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(t.disabled ? "Couldn't enable the team" : "Couldn't disable the team", data.error);
    toast.success(t.disabled ? "Team enabled" : "Team disabled", t.name);
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/teams/${deleting.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error("Couldn't delete the team", data.error);
    else toast.success("Team deleted", deleting.name);
    setDeleting(null);
    load();
  }

  function openTeam(t: Team) {
    const systemHref = SYSTEM_TEAM_HREF[t.slug];
    router.push(systemHref ?? `/teams/${t.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Teams</h1>
          <HelpDialog title="Teams — help">
            <HelpSection heading="What this page is for">
              <p>Every team you&apos;re part of or lead: the built-in Social Media and CRM teams, plus any custom team an Admin creates. Open one to manage its members and see its own Tasks/Leads/attendance/activity.</p>
            </HelpSection>
            <HelpSection heading="Admins & Super Admins">
              <p>Can create a new team and see every team that exists.</p>
            </HelpSection>
            <HelpSection heading="Everyone else">
              <p>You see only the teams you&apos;re a member of.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        {isAdmin && (
          <Tooltip label="New team" side="bottom">
            <Button type="button" size="icon" onClick={openCreate} aria-label="New team">
              <IconPlus className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <Card key={t.id} onClick={() => openTeam(t)} className="cursor-pointer transition-colors hover:border-primary/40">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{t.name}</CardTitle>
                {t.isSystem && <Badge variant="outline">System</Badge>}
                {t.disabled && <Badge variant="destructive">Disabled</Badge>}
              </div>
              {isAdmin && (
                <div onClick={(e) => e.stopPropagation()}>
                  <RowActionsMenu
                    label={`Actions for ${t.name}`}
                    actions={[
                      { key: "rename", label: "Rename", icon: <IconPencil className="h-4 w-4" />, onSelect: () => openRename(t) },
                      {
                        key: "toggle",
                        label: t.disabled ? "Enable" : "Disable",
                        icon: <IconPower className="h-4 w-4" />,
                        onSelect: () => toggleDisabled(t),
                      },
                      ...(t.isSystem
                        ? []
                        : [
                            {
                              key: "delete",
                              label: "Delete",
                              icon: <IconTrash className="h-4 w-4" />,
                              destructive: true,
                              onSelect: () => setDeleting(t),
                            },
                          ]),
                    ]}
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
            </CardContent>
          </Card>
        ))}
        {teams.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">No teams yet.</CardContent>
          </Card>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(v) => !saving && setCreateOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="create-team-form" onSubmit={onCreate}>
              <Input placeholder="e.g. IT" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-team-form" disabled={saving}>
              {saving ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(v) => !renameSaving && !v && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename team</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={renameSaving} onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={renameSaving || !renameValue.trim()} onClick={saveRename}>
              {renameSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This can't be undone. Blocked while it still has members."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
