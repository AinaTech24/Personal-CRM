"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { useToast } from "@/components/providers/toast-provider";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { IconPencil, IconTrash, IconPlus } from "@/components/icons";

interface Department {
  id: string;
  name: string;
  _count: { users: number };
}

export default function DepartmentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Only an Admin gets create/rename/delete — a Department Admin sees this
  // same list (so they have somewhere to click into their own department
  // from) but can't otherwise manage departments as such.
  const [isAdmin, setIsAdmin] = useState(false);
  const [myDepartmentId, setMyDepartmentId] = useState<string | null>(null);

  const [renaming, setRenaming] = useState<Department | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [deleting, setDeleting] = useState<Department | null>(null);

  async function load() {
    const [deptRes, meRes] = await Promise.all([fetch("/api/departments"), fetch("/api/auth/me")]);
    const deptData = await deptRes.json();
    if (deptRes.ok) setDepartments(deptData.departments);
    if (meRes.ok) {
      const me = (await meRes.json()).user;
      setIsAdmin(me?.role === "SUPER_ADMIN" || me?.role === "ADMIN");
      setMyDepartmentId(me?.isDepartmentAdmin ? (me.departmentId ?? null) : null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setName("");
      setCreateOpen(false);
      await load();
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setName("");
    setError(null);
    setCreateOpen(true);
  }

  function openRename(d: Department) {
    setRenaming(d);
    setRenameValue(d.name);
  }

  async function saveRename() {
    if (!renaming || !renameValue.trim()) return;
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/departments/${renaming.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't rename the department", data.error);
      toast.success("Department renamed");
      setRenaming(null);
      load();
    } finally {
      setRenameSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/departments/${deleting.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error("Couldn't delete the department", data.error);
    else toast.success("Department deleted", deleting.name);
    setDeleting(null);
    load();
  }

  /** A department card is clickable for an Admin (any department) or a Department Admin (their own only) — everyone else's detail page would just redirect them home anyway. */
  function canOpen(d: Department) {
    return isAdmin || myDepartmentId === d.id;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Departments</h1>
          <HelpDialog title="Departments — help">
            <HelpSection heading="What this page is for">
              <p>Organizational units such as Development, Design, Sales. Every person belongs to at most one department, and most modules scope a Department Admin&apos;s or module grant&apos;s visibility to it.</p>
            </HelpSection>
            <HelpSection heading="Who can see this">
              <p>Admins and Super Admins can create, rename, or delete a department. A Department Admin can open their own department to manage members and permissions, but not create or delete departments.</p>
            </HelpSection>
          </HelpDialog>
        </div>
        {isAdmin && (
          <Tooltip label="New department" side="bottom">
            <Button type="button" size="icon" onClick={openCreate} aria-label="New department">
              <IconPlus className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {departments.map((d) => {
          const openable = canOpen(d);
          return (
            <Card
              key={d.id}
              onClick={() => openable && router.push(`/admin/departments/${d.id}`)}
              className={openable ? "cursor-pointer transition-colors hover:border-primary/40" : undefined}
            >
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{d.name}</CardTitle>
                {isAdmin && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <RowActionsMenu
                      label={`Actions for ${d.name}`}
                      actions={[
                        { key: "rename", label: "Rename", icon: <IconPencil className="h-4 w-4" />, onSelect: () => openRename(d) },
                        {
                          key: "delete",
                          label: "Delete",
                          icon: <IconTrash className="h-4 w-4" />,
                          destructive: true,
                          onSelect: () => setDeleting(d),
                        },
                      ]}
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {d._count.users} member{d._count.users === 1 ? "" : "s"}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={(v) => !loading && setCreateOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New department</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <form id="create-department-form" onSubmit={onCreate}>
              <Input placeholder="e.g. Development" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </form>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={loading} onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-department-form" disabled={loading}>
              {loading ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renaming} onOpenChange={(v) => !renameSaving && !v && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename department</DialogTitle>
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
        description="This can't be undone. Blocked while anything (members, leads, projects, and more) still belongs to it."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
