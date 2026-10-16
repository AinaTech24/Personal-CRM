"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ManagePermissionsDialog } from "@/components/permissions/manage-permissions-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { IconChevronLeft, IconShield, IconTrash, IconPlus } from "@/components/icons";

/** Social Media and CRM keep their own dedicated consoles — reached directly if someone links here anyway. */
const SYSTEM_TEAM_HREF: Record<string, string> = {
  "social-media": "/social-media/team",
  crm: "/crm/team",
};

interface Member {
  isLead: boolean;
  user: { id: string; name: string; surname: string | null; email: string; avatarDataUrl: string | null; role: string; isActive: boolean };
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  isSystem: boolean;
  disabled: boolean;
  members: Member[];
}

interface Candidate {
  id: string;
  name: string;
  surname: string | null;
  email: string;
}

function fullName(u: { name: string; surname?: string | null }) {
  return [u.name, u.surname].filter(Boolean).join(" ");
}

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  const [permsUser, setPermsUser] = useState<{ id: string; name: string; surname?: string | null } | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  async function load() {
    const [teamRes, meRes] = await Promise.all([fetch(`/api/teams/${params.id}`), fetch("/api/auth/me")]);
    const teamData = await teamRes.json();
    if (!teamRes.ok) {
      setLoadError(teamData.error ?? "Couldn't load this team");
      return;
    }
    setTeam(teamData.team);
    if (meRes.ok) {
      const me = (await meRes.json()).user;
      setIsAdmin(me?.role === "SUPER_ADMIN" || me?.role === "ADMIN");
      setMeId(me?.id ?? null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  useEffect(() => {
    if (!team) return;
    const systemHref = SYSTEM_TEAM_HREF[team.slug];
    if (systemHref) router.replace(systemHref);
  }, [team, router]);

  const myMembership = team?.members.find((m) => m.user.id === meId);
  const canManage = isAdmin || !!myMembership?.isLead;

  async function openAdd() {
    setQuery("");
    setAddOpen(true);
    setCandidates(null);
    const res = await fetch(`/api/teams/${params.id}/candidates`);
    const data = await res.json().catch(() => ({}));
    setCandidates(res.ok ? data.users : []);
  }

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates ?? [];
    return (candidates ?? []).filter((c) => fullName(c).toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [candidates, query]);

  async function addMember(c: Candidate) {
    setAdding(c.id);
    try {
      const res = await fetch(`/api/teams/${params.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: c.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't add them", data.error);
      toast.success("Added to team", fullName(c));
      setCandidates((prev) => (prev ? prev.filter((x) => x.id !== c.id) : prev));
      load();
    } finally {
      setAdding(null);
    }
  }

  async function toggleLead(m: Member) {
    const res = await fetch(`/api/teams/${params.id}/members/${m.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLead: !m.isLead }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't update their role", data.error);
    load();
  }

  async function confirmRemove() {
    if (!removing) return;
    const res = await fetch(`/api/teams/${params.id}/members/${removing.user.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error("Couldn't remove them", data.error);
    else toast.success("Removed from team", fullName(removing.user));
    setRemoving(null);
    load();
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" className="w-fit" onClick={() => router.push("/teams")}>
          Back to teams
        </Button>
      </div>
    );
  }

  if (!team || SYSTEM_TEAM_HREF[team.slug]) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/teams")} aria-label="Back to teams">
            <IconChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{team.name}</h1>
              {team.disabled && <Badge variant="destructive">Disabled</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {team.members.length} member{team.members.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {canManage && (
          <Button onClick={openAdd}>
            <IconPlus className="mr-2 h-4 w-4" />
            Add member
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {team.members.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">No members yet{canManage ? " — add someone to get started." : "."}</p>
          )}
          {team.members.map((m) => {
            const isSelf = m.user.id === meId;
            return (
              <div key={m.user.id} className="flex items-center gap-3 p-4">
                <UserAvatar name={m.user.name} avatarDataUrl={m.user.avatarDataUrl} className="h-9 w-9 text-sm" />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{fullName(m.user)}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                </div>
                {!m.user.isActive && <Badge variant="destructive">Blocked</Badge>}
                {canManage ? (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Lead
                    <ToggleSwitch checked={m.isLead} onChange={() => toggleLead(m)} label={`${fullName(m.user)} is a team lead`} />
                  </label>
                ) : (
                  m.isLead && <Badge variant="success">Lead</Badge>
                )}
                {canManage && (
                  <div className="flex items-center gap-0.5 border-l border-border pl-2">
                    {!isSelf && (
                      <Tooltip label="Manage permissions" side="bottom">
                        <button
                          type="button"
                          onClick={() => setPermsUser(m.user)}
                          aria-label={`Manage permissions for ${fullName(m.user)}`}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                        >
                          <IconShield className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip label="Remove from team" side="bottom">
                      <button
                        type="button"
                        onClick={() => setRemoving(m)}
                        aria-label={`Remove ${fullName(m.user)} from team`}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add to {team.name}</DialogTitle>
            <DialogDescription>Pick someone already in Aina CRM.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" autoFocus />
            <div className="mt-2 flex max-h-72 flex-col gap-0.5 overflow-y-auto">
              {candidates === null ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading...</p>
              ) : filteredCandidates.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No one to show.</p>
              ) : (
                filteredCandidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={adding === c.id}
                    onClick={() => addMember(c)}
                    className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-primary/5 disabled:opacity-50"
                  >
                    <UserAvatar name={c.name} className="h-7 w-7 shrink-0 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{fullName(c)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{c.email}</span>
                    </span>
                    {adding === c.id && <span className="text-xs text-muted-foreground">Adding...</span>}
                  </button>
                ))
              )}
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ManagePermissionsDialog user={permsUser} onOpenChange={(open) => !open && setPermsUser(null)} />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Remove ${removing ? fullName(removing.user) : ""} from ${team.name}?`}
        description="They'll lose whatever access this team membership granted them."
        confirmLabel="Remove"
        onConfirm={confirmRemove}
      />
    </div>
  );
}
