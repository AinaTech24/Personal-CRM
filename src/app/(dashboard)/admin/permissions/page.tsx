"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { SkeletonTable } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useToast } from "@/components/providers/toast-provider";
import { MANAGED_MODULES, MODULE_ACTIONS, MODULE_ACTION_LABEL, MODULE_LABEL, NO_MODULE_ACCESS, FULL_MODULE_ACCESS, type ManagedModule, type ModuleAction, type ModulePermissionFlags } from "@/lib/module-permissions";
import { cn } from "@/lib/utils";

interface Candidate {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  departmentId: string | null;
  department: { name: string } | null;
}

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

function PermissionManager() {
  const toast = useToast();
  const searchParams = useSearchParams();

  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadCandidates = useCallback(async () => {
    const res = await fetch("/api/admin/permissions/users");
    const data = await res.json().catch(() => ({}));
    setCandidates(res.ok ? data.users : []);
  }, []);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  // A click from Admin > Users' own Permissions button preselects that user.
  useEffect(() => {
    const fromQuery = searchParams.get("userId");
    if (fromQuery) setSelectedId(fromQuery);
  }, [searchParams]);

  const loadMatrix = useCallback(async (userId: string) => {
    setLoadingMatrix(true);
    try {
      const res = await fetch(`/api/admin/permissions/${userId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't load their permissions", data.error);
        setSelectedId(null);
        return;
      }
      setMatrix(data.matrix);
      setDirty(false);
    } finally {
      setLoadingMatrix(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadMatrix(selectedId);
  }, [selectedId, loadMatrix]);

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates ?? [];
    return (candidates ?? []).filter((c) => {
      const full = [c.name, c.surname].filter(Boolean).join(" ").toLowerCase();
      return full.includes(q) || c.email.toLowerCase().includes(q) || (c.department?.name ?? "").toLowerCase().includes(q);
    });
  }, [candidates, query]);

  const selected = candidates?.find((c) => c.id === selectedId) ?? null;

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
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/permissions/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matrix }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save permissions", data.error);
      setMatrix(data.matrix);
      setDirty(false);
      toast.success("Permissions saved", selected ? [selected.name, selected.surname].filter(Boolean).join(" ") : undefined);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Permission Manager</h1>
        <p className="text-sm text-muted-foreground">
          Grant someone full create/read/update/delete access to specific modules — across every department, on top of
          whatever their role already allows.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" />
            <div className="flex max-h-[32rem] flex-col gap-0.5 overflow-y-auto">
              {candidates === null ? (
                <SkeletonTable rows={6} columns={1} />
              ) : filteredCandidates.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No one to show.</p>
              ) : (
                filteredCandidates.map((c) => {
                  const full = [c.name, c.surname].filter(Boolean).join(" ");
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-primary/5",
                        selectedId === c.id && "bg-accent"
                      )}
                    >
                      <UserAvatar name={full} className="h-7 w-7 shrink-0 text-xs" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{full}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.department?.name ?? "No department"}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            {!selected ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Pick someone on the left to manage their permissions.</p>
            ) : loadingMatrix ? (
              <SkeletonTable rows={MANAGED_MODULES.length} columns={5} />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{[selected.name, selected.surname].filter(Boolean).join(" ")}</p>
                    <p className="text-xs text-muted-foreground">{selected.email} · {selected.department?.name ?? "No department"}</p>
                  </div>
                  <Button size="sm" onClick={save} disabled={!dirty || saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </div>

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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function PermissionManagerPage() {
  return (
    <Suspense fallback={null}>
      <PermissionManager />
    </Suspense>
  );
}
