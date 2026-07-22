"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dropdown } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { IconPlus, IconX } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { formatDuration } from "@/lib/project-time";
import type { AssignableUser, ProjectDetail } from "@/components/projects/types";

/**
 * People helping on a project who aren't on its team.
 *
 * Separate from Team members on purpose: adding a supporter shouldn't change
 * headcount, ownership or the project's access rules — it records that someone
 * contributed. Their logged hours show here so the list isn't just names.
 */
export function ProjectSupportersCard({
  project,
  assignableUsers,
  onChanged,
}: {
  project: ProjectDetail;
  assignableUsers: AssignableUser[];
  onChanged: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  /** Minutes each supporter has logged, so the card shows contribution not just membership. */
  const minutesByUser = new Map<string, number>();
  for (const entry of project.timeEntries) {
    minutesByUser.set(entry.user.id, (minutesByUser.get(entry.user.id) ?? 0) + entry.minutes);
  }

  // Team members are excluded: someone already on the team isn't a supporter,
  // and offering them here would create two competing records of the same person.
  const options = assignableUsers.filter(
    (u) =>
      !project.supporters.some((s) => s.user.id === u.id) &&
      !project.members.some((m) => m.user.id === u.id)
  );

  async function addSupporter() {
    if (!userId) return toast.error("Pick someone to add");
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/supporters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: role.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't add supporter", data.error);
      toast.success("Supporter added");
      setUserId("");
      setRole("");
      setAdding(false);
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function removeSupporter(id: string, name: string) {
    const res = await fetch(`/api/projects/${project.id}/supporters/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't remove supporter", data.error);
    toast.success(`${name} removed from supporters`);
    await onChanged();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Supporters</CardTitle>
          <p className="text-xs text-muted-foreground">Helping out, not on the team</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setAdding((v) => !v)}>
          <IconPlus className="h-3.5 w-3.5" />
          {adding ? "Cancel" : "Add"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {adding && (
          <div className="flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="flex flex-col gap-1.5">
              <Label>Person</Label>
              <Dropdown
                value={userId}
                onChange={setUserId}
                placeholder="Select a user"
                emptyMessage="Everyone's already a member or supporter"
                options={options.map((u) => ({
                  value: u.id,
                  label: u.surname ? `${u.name} ${u.surname}` : u.name,
                  avatarDataUrl: u.avatarDataUrl,
                  showAvatar: true,
                }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supporter-role">How they help (optional)</Label>
              <Input
                id="supporter-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Security review"
              />
            </div>
            <Button type="button" size="sm" disabled={saving || !userId} onClick={addSupporter}>
              {saving ? "Adding…" : "Add supporter"}
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {project.supporters.map((s) => {
            const minutes = minutesByUser.get(s.user.id) ?? 0;
            return (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-md bg-accent/50 px-2 py-1.5 text-sm hover:bg-primary/5">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[10px] font-medium text-primary">
                    {s.user.avatarDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.user.avatarDataUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      s.user.name.charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">
                      {s.user.surname ? `${s.user.name} ${s.user.surname}` : s.user.name}
                    </span>
                    {s.role && <span className="block truncate text-xs text-muted-foreground">{s.role}</span>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {minutes > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground">{formatDuration(minutes)}</span>
                  )}
                  <Tooltip label="Remove supporter" side="top">
                    <button
                      type="button"
                      onClick={() => removeSupporter(s.user.id, s.user.name)}
                      aria-label={`Remove ${s.user.name}`}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
                    >
                      <IconX className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                </span>
              </div>
            );
          })}
          {project.supporters.length === 0 && (
            <p className="text-xs text-muted-foreground">No supporters yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
