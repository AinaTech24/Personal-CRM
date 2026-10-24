"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { SkeletonTable } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { copyTextFromAsync } from "@/lib/clipboard";
import { IconBuilding, IconCode, IconCopy, IconEye, IconFileSpreadsheet, IconPencil, IconPlus, IconTrash } from "@/components/icons";

interface FormRow {
  id: string;
  title: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  fieldCount: number;
  submissionCount: number;
  canEdit: boolean;
  department: { id: string; name: string } | null;
}

export function FormsListView() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<FormRow[] | null>(null);
  // Whether the current user can create/edit forms at all — a top-level flag
  // from the API, not inferred from the rows: with zero forms there's no row
  // to infer "am I an admin" from, which previously hid the button for anyone
  // whose first visit found an empty list.
  const [canCreate, setCanCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<FormRow | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [settingDepartmentFor, setSettingDepartmentFor] = useState<FormRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/forms");
    const data = res.ok ? await res.json() : { forms: [], canManage: false };
    setRows(data.forms ?? []);
    setCanCreate(!!data.canManage);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/departments")
      .then((r) => r.json())
      .then((d) => setDepartments(d.departments ?? []))
      .catch(() => {});
  }, [load]);

  const departmentFilterOptions = useMemo(
    () => [{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))],
    [departments]
  );

  const visibleRows = useMemo(
    () => (rows ?? []).filter((r) => !departmentFilter || r.department?.id === departmentFilter),
    [rows, departmentFilter]
  );

  // Straight into the editor with a placeholder title, rather than asking for
  // one in a dialog first — the title field is right there at the top of the
  // builder to rename immediately.
  async function createForm() {
    setCreating(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled form" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't create the form", data.error);
      router.push(`/forms/${data.form.id}/edit`);
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(row: FormRow) {
    try {
      const url = await copyTextFromAsync(async () => {
        const res = await fetch(`/api/forms/${row.id}/copy-link`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't copy the link");
        return `${window.location.origin}/f/${data.slug}`;
      });
      toast.success("Form link copied");
      // The slug may have just rotated — keep the row (and its "View form"
      // action) pointed at whatever link is now actually live.
      const slug = url.split("/").pop()!;
      setRows((prev) => (prev ? prev.map((r) => (r.id === row.id ? { ...r, slug } : r)) : prev));
    } catch (err) {
      toast.error("Couldn't copy the link", err instanceof Error ? err.message : undefined);
    }
  }

  // Uses the form's current slug as-is — unlike copyLink, this never rotates
  // it. An embed is pasted once into someone else's site and left there;
  // rotating the slug on every copy would break every page it's already on.
  async function copyEmbedCode(row: FormRow) {
    const src = `${window.location.origin}/f/${row.slug}?embedded=true`;
    const snippet = `<iframe src="${src}" style="width:100%;max-width:640px;height:800px;border:0" title="${row.title.replace(/"/g, "&quot;")}"></iframe>`;
    try {
      await navigator.clipboard.writeText(snippet);
      toast.success("Embed code copied", "Paste it into any page's HTML.");
    } catch {
      toast.error("Couldn't copy the embed code");
    }
  }

  // Clones straight into the editor, same as creating fresh — the copy
  // already has its own title, fields and link; nothing left to fill in
  // before looking at it.
  async function duplicateForm(row: FormRow) {
    const res = await fetch(`/api/forms/${row.id}/duplicate`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't duplicate the form", data.error);
    toast.success("Form duplicated", `${row.title} (Copy)`);
    router.push(`/forms/${data.form.id}/edit`);
  }

  async function saveDepartment(departmentId: string) {
    if (!settingDepartmentFor) return;
    const res = await fetch(`/api/forms/${settingDepartmentFor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId: departmentId || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't set department", data.error);
    toast.success("Department updated");
    setSettingDepartmentFor(null);
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/forms/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Couldn't delete the form");
    else toast.success("Form deleted", deleting.title);
    setDeleting(null);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Forms</h1>
          <p className="text-sm text-muted-foreground">Build public forms and review what people submit.</p>
        </div>
        <div className="flex items-center gap-2">
          {rows && rows.length > 0 && (
            <Dropdown
              size="sm"
              value={departmentFilter}
              onChange={setDepartmentFilter}
              options={departmentFilterOptions}
              className="w-44"
            />
          )}
          {canCreate && (
            <Tooltip label="New Form">
              <Button type="button" size="icon" aria-label="New Form" onClick={createForm} disabled={creating}>
                <IconPlus className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {!rows ? (
        <SkeletonTable rows={4} columns={6} />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <IconFileSpreadsheet className="h-6 w-6" />
            No forms yet. Create one to get a shareable link.
          </CardContent>
        </Card>
      ) : visibleRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <IconFileSpreadsheet className="h-6 w-6" />
            No forms for that department.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    {["Title", "Status", "Department", "Fields", "Submissions", "Created", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => window.open(`/f/${r.slug}`, "_blank", "noopener,noreferrer")}
                        >
                          {r.title}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge variant={r.isActive ? "success" : "outline"}>{r.isActive ? "Active" : "Inactive"}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.canEdit ? (
                          <button
                            type="button"
                            onClick={() => setSettingDepartmentFor(r)}
                            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-ring/50 hover:text-foreground"
                          >
                            <IconBuilding className="h-3.5 w-3.5" />
                            {r.department ? r.department.name : "Set department"}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">{r.department?.name ?? "—"}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{r.fieldCount}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{r.submissionCount}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{format(parseISO(r.createdAt), "dd MMM yyyy")}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button type="button" size="sm" variant="outline" asChild>
                            <Link href={`/forms/${r.id}/submissions`}>Submissions</Link>
                          </Button>
                          {r.canEdit && (
                            <RowActionsMenu
                              label={`Actions for ${r.title}`}
                              actions={[
                                {
                                  key: "view",
                                  label: "View form",
                                  icon: <IconEye className="h-4 w-4" />,
                                  onSelect: () => window.open(`/f/${r.slug}`, "_blank", "noopener,noreferrer"),
                                },
                                {
                                  key: "edit",
                                  label: "Edit form",
                                  icon: <IconPencil className="h-4 w-4" />,
                                  onSelect: () => router.push(`/forms/${r.id}/edit`),
                                },
                                {
                                  key: "copy-link",
                                  label: "Copy link",
                                  icon: <IconCopy className="h-4 w-4" />,
                                  onSelect: () => copyLink(r),
                                },
                                {
                                  key: "copy-embed",
                                  label: "Copy embed code",
                                  icon: <IconCode className="h-4 w-4" />,
                                  onSelect: () => copyEmbedCode(r),
                                },
                                {
                                  key: "duplicate",
                                  label: "Duplicate",
                                  icon: <IconCopy className="h-4 w-4" />,
                                  onSelect: () => duplicateForm(r),
                                },
                                {
                                  key: "delete",
                                  label: "Delete form",
                                  icon: <IconTrash className="h-4 w-4" />,
                                  destructive: true,
                                  onSelect: () => setDeleting(r),
                                },
                              ]}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this form?"
        description={deleting ? `"${deleting.title}" and its ${deleting.submissionCount} submission(s) will be permanently deleted.` : ""}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />

      {settingDepartmentFor && (
        <DepartmentPickerDialog
          form={settingDepartmentFor}
          departments={departments}
          onOpenChange={(v) => !v && setSettingDepartmentFor(null)}
          onSave={saveDepartment}
        />
      )}
    </div>
  );
}

function DepartmentPickerDialog({
  form,
  departments,
  onOpenChange,
  onSave,
}: {
  form: FormRow;
  departments: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onSave: (departmentId: string) => Promise<void>;
}) {
  const [departmentId, setDepartmentId] = useState(form.department?.id ?? "");
  const [saving, setSaving] = useState(false);
  const departmentOptions = departments.map((d) => ({ value: d.id, label: d.name }));

  async function save() {
    setSaving(true);
    try {
      await onSave(departmentId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Department</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="mb-3 text-sm text-muted-foreground">Which department is &ldquo;{form.title}&rdquo; for?</p>
          <Dropdown value={departmentId} onChange={setDepartmentId} options={departmentOptions} placeholder="Choose a department" />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving || !departmentId}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
