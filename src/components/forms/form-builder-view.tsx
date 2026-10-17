"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { SkeletonForm } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { copyTextFromAsync } from "@/lib/clipboard";
import { FIELD_PALETTE, FIELD_TYPE_META, parseFieldOptions, type FormFieldType } from "@/lib/form-fields";
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconExternalLink,
  IconFile,
  IconGrid,
  IconHelpCircle,
  IconPlus,
  IconTrash,
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface FieldRow {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  order: number;
  options: string | null;
}

interface Department {
  id: string;
  name: string;
}

interface FormDetail {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  isActive: boolean;
  /** When true, Copy link never rotates the slug — for a form whose link needs to stay stable, e.g. embedded on a website. */
  lockSlug: boolean;
  fields: FieldRow[];
  viewerDepartments: { departmentId: string; department: { id: string; name: string } }[];
}

const DROP_ZONE_ID = "form-canvas";

/**
 * The canvas's own droppable zone, mounted only while it has no fields yet.
 * Once fields exist, SortableContext's own items are the drop targets —
 * having both this wrapper and the sortable items droppable at once let
 * dnd-kit's collision detection resolve `over` to this container instead of
 * the specific field being dropped onto, which silently no-opped reordering.
 */
function EmptyCanvas() {
  const { setNodeRef } = useDroppable({ id: DROP_ZONE_ID });
  return (
    <div ref={setNodeRef} className="flex flex-1 items-center justify-center py-10 text-center text-sm text-muted-foreground">
      Drag a field type here, or click one on the left, to start building the form.
    </div>
  );
}

function PaletteItem({ type, onAdd }: { type: FormFieldType; onAdd: () => void }) {
  const meta = FIELD_TYPE_META[type];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette-${type}`, data: { kind: "palette", type } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onAdd}
      {...listeners}
      {...attributes}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5 active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <IconFile className="h-4 w-4 shrink-0 text-muted-foreground" />
      {meta.label}
    </button>
  );
}

function FieldSettings({ field, onChange }: { field: FieldRow; onChange: (patch: Partial<FieldRow>) => void }) {
  const meta = FIELD_TYPE_META[field.type];
  const [options, setOptions] = useState(() => parseFieldOptions(field.options));
  const [newOption, setNewOption] = useState("");

  function commitOptions(next: string[]) {
    setOptions(next);
    onChange({ options: next.join("|") });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-3">
      {!meta.isLayoutOnly && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Placeholder</Label>
          <Input
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
            placeholder={field.type === "DROPDOWN" ? "Select..." : "Shown inside the empty field"}
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Help text</Label>
        <Textarea rows={2} value={field.helpText ?? ""} onChange={(e) => onChange({ helpText: e.target.value })} />
      </div>
      {meta.hasOptions && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Choices</Label>
          <div className="flex flex-col gap-1">
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={o}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = e.target.value;
                    commitOptions(next);
                  }}
                  className="h-8"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => commitOptions(options.filter((_, idx) => idx !== i))}>
                  <IconTrash className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newOption.trim()) {
                    e.preventDefault();
                    commitOptions([...options, newOption.trim()]);
                    setNewOption("");
                  }
                }}
                placeholder="Add a choice"
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!newOption.trim()}
                onClick={() => {
                  commitOptions([...options, newOption.trim()]);
                  setNewOption("");
                }}
              >
                <IconPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
      {!meta.isLayoutOnly && (
        <label className="flex items-center gap-2 text-xs">
          <Checkbox checked={field.required} onChange={(v) => onChange({ required: v })} />
          Required
        </label>
      )}
    </div>
  );
}

function SortableField({
  field,
  expanded,
  onToggleExpand,
  onChange,
  onDelete,
}: {
  field: FieldRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onChange: (patch: Partial<FieldRow>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id, data: { kind: "field" } });
  const meta = FIELD_TYPE_META[field.type];
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn("rounded-lg border border-border bg-card", isDragging && "opacity-50")}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing" aria-label="Drag to reorder">
          <IconGrid className="h-4 w-4" />
        </button>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
        <Input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-8 flex-1 border-transparent bg-transparent px-1.5 font-medium hover:border-input focus-visible:border-input"
        />
        {field.helpText && (
          <Tooltip label={field.helpText}>
            <IconHelpCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Tooltip>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={onToggleExpand} aria-label="Field settings">
          <IconChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDelete} aria-label="Delete field">
          <IconTrash className="h-4 w-4" />
        </Button>
      </div>
      {expanded && <FieldSettings field={field} onChange={onChange} />}
    </div>
  );
}

export function FormBuilderView({ formId }: { formId: string }) {
  const toast = useToast();
  const [form, setForm] = useState<FormDetail | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeDragType, setActiveDragType] = useState<FormFieldType | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deletingField, setDeletingField] = useState<FieldRow | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTitleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const load = useCallback(async () => {
    const [formRes, deptRes] = await Promise.all([fetch(`/api/forms/${formId}`), fetch("/api/departments")]);
    if (formRes.ok) setForm((await formRes.json()).form);
    if (deptRes.ok) setDepartments((await deptRes.json()).departments);
  }, [formId]);

  useEffect(() => {
    load();
  }, [load]);

  function patchFormMeta(patch: Partial<Pick<FormDetail, "title" | "description" | "isActive" | "lockSlug">>) {
    setForm((f) => (f ? { ...f, ...patch } : f));
    fetch(`/api/forms/${formId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).catch(() => toast.error("Couldn't save"));
  }

  function onTitleChange(title: string) {
    setForm((f) => (f ? { ...f, title } : f));
    if (saveTitleTimer.current) clearTimeout(saveTitleTimer.current);
    saveTitleTimer.current = setTimeout(() => patchFormMeta({ title }), 500);
  }

  async function toggleDepartment(departmentId: string, checked: boolean) {
    if (!form) return;
    const current = form.viewerDepartments.map((v) => v.departmentId);
    const next = checked ? [...current, departmentId] : current.filter((id) => id !== departmentId);
    const res = await fetch(`/api/forms/${formId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewerDepartmentIds: next }),
    });
    if (res.ok) setForm((await res.json()).form);
    else toast.error("Couldn't update sharing");
  }

  async function addField(type: FormFieldType) {
    if (!form) return;
    const meta = FIELD_TYPE_META[type];
    const res = await fetch(`/api/forms/${formId}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        label: meta.label,
        options: meta.hasOptions ? ["Option 1", "Option 2"] : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't add field", data.error);
    setForm((f) => (f ? { ...f, fields: [...f.fields, data.field] } : f));
    setExpandedId(data.field.id);
  }

  function updateField(fieldId: string, patch: Partial<FieldRow>) {
    setForm((f) => (f ? { ...f, fields: f.fields.map((fl) => (fl.id === fieldId ? { ...fl, ...patch } : fl)) } : f));
    const body: Record<string, unknown> = { ...patch };
    if (patch.options !== undefined) body.options = parseFieldOptions(patch.options as string);
    fetch(`/api/forms/${formId}/fields/${fieldId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => toast.error("Couldn't save field"));
  }

  async function confirmDeleteField() {
    if (!deletingField) return;
    const fieldId = deletingField.id;
    setForm((f) => (f ? { ...f, fields: f.fields.filter((fl) => fl.id !== fieldId) } : f));
    const res = await fetch(`/api/forms/${formId}/fields/${fieldId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't delete field");
      load();
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { kind: string; type?: FormFieldType } | undefined;
    if (data?.kind === "palette" && data.type) setActiveDragType(data.type);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragType(null);
    const { active, over } = event;
    if (!over || !form) return;
    const activeData = active.data.current as { kind: string; type?: FormFieldType } | undefined;

    if (activeData?.kind === "palette" && activeData.type) {
      addField(activeData.type);
      return;
    }

    if (activeData?.kind === "field" && active.id !== over.id) {
      const oldIndex = form.fields.findIndex((f) => f.id === active.id);
      const newIndex = form.fields.findIndex((f) => f.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(form.fields, oldIndex, newIndex);
      setForm({ ...form, fields: reordered });
      fetch(`/api/forms/${formId}/fields/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldIds: reordered.map((f) => f.id) }),
      }).catch(() => toast.error("Couldn't save the new order"));
    }
  }

  async function copyLink() {
    if (!form) return;
    try {
      const url = await copyTextFromAsync(async () => {
        const res = await fetch(`/api/forms/${formId}/copy-link`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't copy the link");
        return `${window.location.origin}/f/${data.slug}`;
      });
      // The slug may have just rotated — keep the builder's own Preview/the
      // displayed link pointed at whatever is now actually live.
      setForm((f) => (f ? { ...f, slug: url.split("/").pop()! } : f));
      toast.success("Form link copied");
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast.error("Couldn't copy the link", err instanceof Error ? err.message : undefined);
    }
  }

  if (!form) return <SkeletonForm fields={6} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <Input
          value={form.title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="h-auto border-none bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0"
          placeholder="Form title"
        />
        <Textarea
          value={form.description ?? ""}
          onChange={(e) => patchFormMeta({ description: e.target.value })}
          placeholder="Description (optional)"
          rows={2}
          className="border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <label className="mr-2 flex items-center gap-2 text-sm">
            <ToggleSwitch checked={form.isActive} onChange={(v) => patchFormMeta({ isActive: v })} />
            {form.isActive ? "Active" : "Inactive"}
          </label>
          <Tooltip label="Off: copying the link rotates it to a fresh one each time, so an old copy stops working. On: the link stays the same — turn this on for a form embedded on a website.">
            <label className="mr-2 flex items-center gap-2 text-sm">
              <ToggleSwitch checked={form.lockSlug} onChange={(v) => patchFormMeta({ lockSlug: v })} />
              {form.lockSlug ? "Link fixed" : "Link rotates on copy"}
            </label>
          </Tooltip>
          <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <IconExternalLink className="h-3.5 w-3.5" />
            Preview
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={copyLink}>
            <span className="relative flex h-3.5 w-3.5 items-center justify-center">
              <IconCopy className={cn("absolute h-3.5 w-3.5 transition-all duration-200", copied ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
              <IconCheck className={cn("absolute h-3.5 w-3.5 text-emerald-500 transition-all duration-200", copied ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
            </span>
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
        {departments.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
            <Label className="text-xs text-muted-foreground">Also let these departments view submissions (Admins always can)</Label>
            <div className="flex flex-wrap gap-3">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={form.viewerDepartments.some((v) => v.departmentId === d.id)}
                    onChange={(v) => toggleDepartment(d.id, v)}
                  />
                  {d.name}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[14rem_1fr]">
          <div className="flex flex-col gap-2 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:self-start md:overflow-y-auto">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">Add a field</p>
            {FIELD_PALETTE.map((type) => (
              <PaletteItem key={type} type={type} onAdd={() => addField(type)} />
            ))}
          </div>

          <div className="flex min-h-40 flex-col gap-2 rounded-lg border border-dashed border-border p-3">
            {form.fields.length === 0 ? (
              <EmptyCanvas />
            ) : (
              <SortableContext items={form.fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                {form.fields.map((field) => (
                  <SortableField
                    key={field.id}
                    field={field}
                    expanded={expandedId === field.id}
                    onToggleExpand={() => setExpandedId((id) => (id === field.id ? null : field.id))}
                    onChange={(patch) => updateField(field.id, patch)}
                    onDelete={() => setDeletingField(field)}
                  />
                ))}
              </SortableContext>
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDragType && (
            <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-card px-3 py-2 text-sm shadow-lg">
              <IconFile className="h-4 w-4 text-muted-foreground" />
              {FIELD_TYPE_META[activeDragType].label}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent size="lg" className="h-[90dvh] max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>Form preview</DialogTitle>
            <DialogDescription>What a visitor sees at the public link.</DialogDescription>
          </DialogHeader>
          <DialogBody className="p-0">
            {previewOpen && <iframe src={`/f/${form.slug}`} title={`${form.title} preview`} className="h-full w-full border-0" />}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingField}
        onOpenChange={(v) => !v && setDeletingField(null)}
        title={`Delete "${deletingField?.label}"?`}
        description="This can't be undone. Any answers already submitted for this field — across every past response — are permanently deleted too, not just removed from new submissions."
        confirmLabel="Delete"
        onConfirm={confirmDeleteField}
      />
    </div>
  );
}
