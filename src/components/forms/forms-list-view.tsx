"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SkeletonTable } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { useToast } from "@/components/providers/toast-provider";
import { IconEye, IconFileSpreadsheet, IconPencil, IconPlus, IconTrash } from "@/components/icons";

interface FormRow {
  id: string;
  title: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  fieldCount: number;
  submissionCount: number;
  canEdit: boolean;
}

export function FormsListView() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<FormRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<FormRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/forms");
    setRows(res.ok ? (await res.json()).forms : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createForm() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't create the form", data.error);
      router.push(`/forms/${data.form.id}/edit`);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/forms/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Couldn't delete the form");
    else toast.success("Form deleted", deleting.title);
    setDeleting(null);
    load();
  }

  const canCreate = rows?.some((r) => r.canEdit) ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Forms</h1>
          <p className="text-sm text-muted-foreground">Build public forms and review what people submit.</p>
        </div>
        {(canCreate || rows === null) && (
          <Button type="button" onClick={() => setCreating(true)}>
            <IconPlus className="h-4 w-4" />
            New Form
          </Button>
        )}
      </div>

      {!rows ? (
        <SkeletonTable rows={4} columns={5} />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <IconFileSpreadsheet className="h-6 w-6" />
            No forms yet. Create one to get a shareable link.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    {["Title", "Status", "Fields", "Submissions", "Created", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/forms/${r.id}/submissions`} className="font-medium hover:underline">
                          {r.title}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge variant={r.isActive ? "success" : "outline"}>{r.isActive ? "Active" : "Inactive"}</Badge>
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

      <Dialog open={creating} onOpenChange={(v) => !saving && setCreating(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New form</DialogTitle>
            <DialogDescription>Give it a title and description — you&apos;ll add fields next.</DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-form-title">Title</Label>
              <Input id="new-form-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-form-description">Description (optional)</Label>
              <Textarea id="new-form-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || !title.trim()} onClick={createForm}>
              {saving ? "Creating..." : "Create & continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this form?"
        description={deleting ? `"${deleting.title}" and its ${deleting.submissionCount} submission(s) will be permanently deleted.` : ""}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
