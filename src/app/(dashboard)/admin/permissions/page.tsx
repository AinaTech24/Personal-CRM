"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dropdown } from "@/components/ui/dropdown";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { SkeletonTable } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
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
import { cn } from "@/lib/utils";

interface Candidate {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  departmentId: string | null;
  department: { name: string } | null;
}

interface GranteeRow {
  id: string;
  name: string;
  surname: string | null;
  email: string;
  department: { name: string } | null;
  flags: ModulePermissionFlags;
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

const MODULE_OPTIONS = MANAGED_MODULES.map((m) => ({ value: m, label: MODULE_LABEL[m] }));

function PermissionManager() {
  const toast = useToast();
  const searchParams = useSearchParams();

  const [view, setView] = useState<"person" | "module">("person");

  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix());
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [copyFromId, setCopyFromId] = useState("");
  const [copying, setCopying] = useState(false);

  const [moduleFilter, setModuleFilter] = useState<ManagedModule>(MANAGED_MODULES[0]);
  const [grantees, setGrantees] = useState<GranteeRow[] | null>(null);
  const [loadingGrantees, setLoadingGrantees] = useState(false);

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

  const loadGrantees = useCallback(
    async (module: ManagedModule) => {
      setLoadingGrantees(true);
      try {
        const res = await fetch(`/api/admin/permissions/by-module/${module}`);
        const data = await res.json().catch(() => ({}));
        setGrantees(res.ok ? data.grantees : []);
      } finally {
        setLoadingGrantees(false);
      }
    },
    []
  );

  useEffect(() => {
    if (view === "module") loadGrantees(moduleFilter);
  }, [view, moduleFilter, loadGrantees]);

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates ?? [];
    return (candidates ?? []).filter((c) => {
      const full = [c.name, c.surname].filter(Boolean).join(" ").toLowerCase();
      return full.includes(q) || c.email.toLowerCase().includes(q) || (c.department?.name ?? "").toLowerCase().includes(q);
    });
  }, [candidates, query]);

  const selected = candidates?.find((c) => c.id === selectedId) ?? null;
  const copyCandidates = (candidates ?? []).filter((c) => c.id !== selectedId);

  function toggle(module: ManagedModule, action: ModuleAction) {
    const key = FLAG_KEY[action];
    setMatrix((prev) => ({ ...prev, [module]: { ...prev[module], [key]: !prev[module][key] } }));
    setDirty(true);
  }

  // Deliberately independent of the four CRUD flags — hides the module's
  // nav link for this person outright. Kept out of Quick set's Clear/Grant
  // all (below) so fixing someone's CRUD grants never silently un-blocks them.
  function toggleAccess(module: ManagedModule) {
    setMatrix((prev) => ({ ...prev, [module]: { ...prev[module], blocked: !prev[module].blocked } }));
    setDirty(true);
  }

  function setModuleAll(module: ManagedModule, flags: ModulePermissionFlags) {
    setMatrix((prev) => ({ ...prev, [module]: { ...flags, blocked: prev[module].blocked } }));
    setDirty(true);
  }

  async function copyFrom(sourceId: string) {
    if (!sourceId) return;
    setCopying(true);
    try {
      const res = await fetch(`/api/admin/permissions/${sourceId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load their permissions", data.error);
      setMatrix(data.matrix);
      setDirty(true);
      const source = candidates?.find((c) => c.id === sourceId);
      toast.success("Copied", source ? `From ${[source.name, source.surname].filter(Boolean).join(" ")} — remember to save` : undefined);
    } finally {
      setCopying(false);
      setCopyFromId("");
    }
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Permission Manager</h1>
          <p className="text-sm text-muted-foreground">
            Grant someone full create/read/update/delete access to specific modules within their own department, on top
            of whatever their role already allows. A company Admin already has every module, company-wide. The Access
            column is separate from those four — turning it off blocks this one person from that module entirely
            (nav link and the module&apos;s own pages/API alike, even their own records), where the CRUD toggles only
            ever widen their visibility beyond that. Messages is nav/page-only, since conversations work by membership
            rather than ownership.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          <Button size="sm" variant={view === "person" ? "default" : "ghost"} onClick={() => setView("person")}>
            By person
          </Button>
          <Button size="sm" variant={view === "module" ? "default" : "ghost"} onClick={() => setView("module")}>
            By module
          </Button>
        </div>
      </div>

      {view === "person" ? (
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{[selected.name, selected.surname].filter(Boolean).join(" ")}</p>
                      <p className="text-xs text-muted-foreground">{selected.email} · {selected.department?.name ?? "No department"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-48">
                        <Dropdown
                          size="sm"
                          value={copyFromId}
                          onChange={(v) => {
                            setCopyFromId(v);
                            copyFrom(v);
                          }}
                          placeholder="Copy from…"
                          disabled={copying}
                          options={copyCandidates.map((c) => ({ value: c.id, label: [c.name, c.surname].filter(Boolean).join(" ") }))}
                        />
                      </div>
                      <Button size="sm" onClick={save} disabled={!dirty || saving}>
                        {saving ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
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
                          <th className="whitespace-nowrap px-2 py-2 text-center font-medium">Access</th>
                          <th className="whitespace-nowrap px-2 py-2 text-right font-medium">Quick set</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MANAGED_MODULES.map((module) => {
                          const flags = matrix[module];
                          const allGranted = flags.canCreate && flags.canRead && flags.canUpdate && flags.canDelete;
                          return (
                            <tr key={module} className="border-b border-border/50 last:border-0">
                              <td className="whitespace-nowrap px-2 py-2.5 font-medium">
                                {MODULE_LABEL[module]}
                                {flags.blocked && (
                                  <span className="ml-1.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-normal text-destructive">
                                    Hidden
                                  </span>
                                )}
                              </td>
                              {MODULE_ACTIONS.map((action) => (
                                <td key={action} className="px-2 py-2.5 text-center">
                                  <ToggleSwitch
                                    checked={flags[FLAG_KEY[action]]}
                                    onChange={() => toggle(module, action)}
                                    label={`${MODULE_ACTION_LABEL[action]} ${MODULE_LABEL[module]}`}
                                  />
                                </td>
                              ))}
                              <td className="px-2 py-2.5 text-center">
                                <ToggleSwitch
                                  checked={!flags.blocked}
                                  onChange={() => toggleAccess(module)}
                                  label={`${flags.blocked ? "Unhide" : "Hide"} ${MODULE_LABEL[module]} for this person`}
                                />
                              </td>
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
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="w-56">
              <Dropdown value={moduleFilter} onChange={(v) => setModuleFilter(v as ManagedModule)} options={MODULE_OPTIONS} />
            </div>
            {loadingGrantees ? (
              <SkeletonTable rows={6} columns={5} />
            ) : !grantees || grantees.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No one holds a grant on {MODULE_LABEL[moduleFilter]} yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="whitespace-nowrap px-2 py-2 font-medium">Person</th>
                      {MODULE_ACTIONS.map((action) => (
                        <th key={action} className="whitespace-nowrap px-2 py-2 text-center font-medium">
                          {MODULE_ACTION_LABEL[action]}
                        </th>
                      ))}
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {grantees.map((g) => (
                      <tr key={g.id} className="border-b border-border/50 last:border-0">
                        <td className="whitespace-nowrap px-2 py-2.5">
                          <span className="font-medium">{[g.name, g.surname].filter(Boolean).join(" ")}</span>
                          <span className="ml-1.5 text-xs text-muted-foreground">{g.department?.name ?? "No department"}</span>
                        </td>
                        {MODULE_ACTIONS.map((action) => (
                          <td key={action} className="px-2 py-2.5 text-center">
                            {g.flags[FLAG_KEY[action]] ? "✓" : ""}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-2 py-2.5 text-right">
                          <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => {
                              setSelectedId(g.id);
                              setView("person");
                            }}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
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
