"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Dropdown } from "@/components/ui/dropdown";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/providers/toast-provider";
import {
  MANAGED_MODULES,
  MODULE_ACTIONS,
  MODULE_ACTION_LABEL,
  MODULE_LABEL,
  NO_MODULE_ACCESS,
  FULL_MODULE_ACCESS,
  type ManagedModule,
  type ModuleAction,
  type ModulePermissionFlags,
} from "@/lib/module-permissions";

type Matrix = Record<ManagedModule, ModulePermissionFlags>;

const FLAG_KEY: Record<ModuleAction, keyof ModulePermissionFlags> = {
  CREATE: "canCreate",
  READ: "canRead",
  UPDATE: "canUpdate",
  DELETE: "canDelete",
};

function emptyMatrix(): Matrix {
  return Object.fromEntries(MANAGED_MODULES.map((m) => [m, { ...NO_MODULE_ACCESS }])) as Matrix;
}

/**
 * The Permission Manager's own grant matrix (see /admin/permissions),
 * reused as a dialog anywhere a specific person's module permissions need
 * editing in context — e.g. from a department's or a team's member list —
 * instead of sending the admin off to the standalone page. Fetches/saves
 * through the same /api/admin/permissions/[userId] endpoint, so access
 * (company Admin for anyone, a Department Admin or team lead for their own
 * people) is enforced there, identically either way.
 */
export function ManagePermissionsDialog({
  user,
  onOpenChange,
}: {
  user: { id: string; name: string; surname?: string | null } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [candidates, setCandidates] = useState<{ id: string; name: string; surname: string | null }[]>([]);
  const [copyFromId, setCopyFromId] = useState("");
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch(`/api/admin/permissions/${user.id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("Couldn't load their permissions", data.error);
          onOpenChange(false);
          return;
        }
        setMatrix(data.matrix);
        setDirty(false);
      })
      .finally(() => setLoading(false));
    fetch("/api/admin/permissions/users")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) setCandidates(data.users);
      })
      .catch(() => {});
    setCopyFromId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function copyFrom(sourceId: string) {
    if (!sourceId) return;
    setCopying(true);
    try {
      const res = await fetch(`/api/admin/permissions/${sourceId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load their permissions", data.error);
      setMatrix(data.matrix);
      setDirty(true);
      const source = candidates.find((c) => c.id === sourceId);
      toast.success("Copied", source ? `From ${[source.name, source.surname].filter(Boolean).join(" ")} — remember to save` : undefined);
    } finally {
      setCopying(false);
      setCopyFromId("");
    }
  }

  function toggle(module: ManagedModule, action: ModuleAction) {
    const key = FLAG_KEY[action];
    setMatrix((prev) => ({ ...prev, [module]: { ...prev[module], [key]: !prev[module][key] } }));
    setDirty(true);
  }

  function setModuleAll(module: ManagedModule, flags: ModulePermissionFlags) {
    setMatrix((prev) => ({ ...prev, [module]: { ...flags } }));
    setDirty(true);
  }

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/permissions/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save permissions", data.error);
      setMatrix(data.matrix);
      setDirty(false);
      toast.success("Permissions saved", [user.name, user.surname].filter(Boolean).join(" "));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Permissions {user && `· ${[user.name, user.surname].filter(Boolean).join(" ")}`}</DialogTitle>
          <DialogDescription>
            Grant full create/read/update/delete access to specific modules within their own department, on top of
            whatever their role already allows.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!loading && candidates.length > 0 && (
            <div className="mb-3 flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">Copy from</span>
              <div className="w-48">
                <Dropdown
                  size="sm"
                  value={copyFromId}
                  onChange={(v) => {
                    setCopyFromId(v);
                    copyFrom(v);
                  }}
                  placeholder="Select person…"
                  disabled={copying || saving}
                  options={candidates
                    .filter((c) => c.id !== user?.id)
                    .map((c) => ({ value: c.id, label: [c.name, c.surname].filter(Boolean).join(" ") }))}
                />
              </div>
            </div>
          )}
          {loading ? (
            <SkeletonTable rows={MANAGED_MODULES.length} columns={5} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="whitespace-nowrap px-2 py-2 font-medium">Module</th>
                    {MODULE_ACTIONS.map((action) => (
                      <th key={action} className="whitespace-nowrap px-2 py-2 text-center font-medium">
                        {MODULE_ACTION_LABEL[action]}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-2 py-2 text-right font-medium">Quick set</th>
                  </tr>
                </thead>
                <tbody>
                  {MANAGED_MODULES.map((module) => {
                    const flags = matrix[module];
                    const allGranted = flags.canCreate && flags.canRead && flags.canUpdate && flags.canDelete;
                    return (
                      <tr key={module} className="border-b border-border/50 last:border-0">
                        <td className="whitespace-nowrap px-2 py-2.5 font-medium">{MODULE_LABEL[module]}</td>
                        {MODULE_ACTIONS.map((action) => (
                          <td key={action} className="px-2 py-2.5 text-center">
                            <ToggleSwitch
                              checked={flags[FLAG_KEY[action]]}
                              onChange={() => toggle(module, action)}
                              label={`${MODULE_ACTION_LABEL[action]} ${MODULE_LABEL[module]}`}
                            />
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-2 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setModuleAll(module, allGranted ? NO_MODULE_ACCESS : FULL_MODULE_ACCESS)}
                            className="text-xs text-primary hover:underline"
                          >
                            {allGranted ? "Clear all" : "Grant all"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={save} disabled={!dirty || saving || loading}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
