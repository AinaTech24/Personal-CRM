"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dropdown } from "@/components/ui/dropdown";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IconPlus } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import {
  PRIORITIES,
  REGISTER_KINDS,
  REGISTER_KIND_DEFS,
  commercialTotal,
  formatItemCode,
  isOpenItem,
  isOverdue,
  momTatDays,
  riskScore,
  type DetailField,
  type RegisterKind,
  type RegisterKindDef,
} from "@/lib/consulting";
import { cn } from "@/lib/utils";
import type { ConsultingAccess, RegisterItem } from "./types";
import { Field, formatDateKey, formatINR, useAssignableUsers, userOptions } from "./shared";

const PRIORITY_OPTIONS = [{ value: "", label: "Not set" }, ...PRIORITIES.map((p) => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase() }))];

function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Extra computed column some registers carry, straight from the kit's workbook formulas. */
function computedColumn(kind: RegisterKind): { label: string; render: (i: RegisterItem) => React.ReactNode } | null {
  if (kind === "RISK")
    return {
      label: "Score",
      render: (i) => {
        const s = riskScore(i.details);
        return s === null ? "—" : <span className={cn("tabular-nums", s >= 15 && "font-medium text-destructive")}>{s}</span>;
      },
    };
  if (kind === "COMMERCIAL") return { label: "Total (incl. tax)", render: (i) => formatINR(commercialTotal(i.details)) };
  if (kind === "MEETING")
    return {
      label: "MOM TAT",
      render: (i) => {
        const d = momTatDays(i.details);
        return d === null ? "—" : `${d} day${d === 1 ? "" : "s"}`;
      },
    };
  return null;
}

function detailDisplay(field: DetailField, value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (field.type === "date") return formatDateKey(String(value));
  if (field.key === "amount") return formatINR(Number(value));
  return String(value);
}

export function RegistersTab({
  engagementId,
  items,
  access,
  onChanged,
}: {
  engagementId: string;
  items: RegisterItem[];
  access: ConsultingAccess;
  onChanged: () => void;
}) {
  const [kind, setKind] = useState<RegisterKind>("ACTION");
  const [showClosed, setShowClosed] = useState(true);
  const [editing, setEditing] = useState<RegisterItem | null>(null);
  const [creating, setCreating] = useState(false);
  const today = istToday();
  const def = REGISTER_KIND_DEFS[kind];
  const computed = computedColumn(kind);
  const detailColumns = def.details.filter((f) => f.column);

  const counts = useMemo(() => {
    const out = {} as Record<RegisterKind, number>;
    for (const k of REGISTER_KINDS) out[k] = items.filter((i) => i.kind === k && isOpenItem(k, i.status)).length;
    return out;
  }, [items]);

  const rows = items.filter((i) => i.kind === kind && (showClosed || isOpenItem(kind, i.status)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {REGISTER_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              kind === k ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {REGISTER_KIND_DEFS[k].label}
            {counts[k] > 0 && <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[k]}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show closed
        </label>
        {access.canCreate && (
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <IconPlus className="h-3.5 w-3.5" />
            Add {def.singular.toLowerCase()}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No {def.label.toLowerCase()} {showClosed ? "yet" : "open"}.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 font-medium">ID</th>
                  <th className="px-3 py-2.5 font-medium">{def.titleLabel}</th>
                  {detailColumns.map((f) => (
                    <th key={f.key} className="whitespace-nowrap px-3 py-2.5 font-medium">
                      {f.label.replace(/ \(.*\)$/, "")}
                    </th>
                  ))}
                  {computed && <th className="whitespace-nowrap px-3 py-2.5 font-medium">{computed.label}</th>}
                  {def.hasOwner && <th className="px-3 py-2.5 font-medium">Owner</th>}
                  {def.priorityLabel && <th className="px-3 py-2.5 font-medium">{def.priorityLabel}</th>}
                  {def.dueDateLabel && <th className="whitespace-nowrap px-3 py-2.5 font-medium">{def.dueDateLabel}</th>}
                  <th className="px-3 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const overdue = isOverdue(i, today);
                  return (
                    <tr key={i.id} onClick={() => setEditing(i)} className="cursor-pointer border-b border-border last:border-b-0 hover:bg-primary/5">
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">{formatItemCode(i.kind, i.number)}</td>
                      <td className="max-w-80 px-3 py-2.5">
                        <p className={cn(!isOpenItem(i.kind, i.status) && "text-muted-foreground line-through decoration-muted-foreground/50")}>{i.title}</p>
                      </td>
                      {detailColumns.map((f) => (
                        <td key={f.key} className="max-w-48 truncate px-3 py-2.5 text-muted-foreground">
                          {detailDisplay(f, i.details[f.key])}
                        </td>
                      ))}
                      {computed && <td className="whitespace-nowrap px-3 py-2.5">{computed.render(i)}</td>}
                      {def.hasOwner && (
                        <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                          {i.owner?.name ?? (i.ownerName ? `${i.ownerName} (client)` : "—")}
                        </td>
                      )}
                      {def.priorityLabel && (
                        <td className={cn("px-3 py-2.5 text-xs", (i.priority === "HIGH" || i.priority === "CRITICAL") && "font-medium text-destructive")}>
                          {i.priority ? i.priority.charAt(0) + i.priority.slice(1).toLowerCase() : "—"}
                        </td>
                      )}
                      {def.dueDateLabel && (
                        <td className={cn("whitespace-nowrap px-3 py-2.5", overdue ? "text-destructive" : "text-muted-foreground")}>
                          {formatDateKey(i.dueDate)}
                          {overdue && <span className="ml-1 text-[10px] uppercase">overdue</span>}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">{def.statuses.find((s) => s.value === i.status)?.label ?? i.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ItemDialog
        key={editing?.id ?? (creating ? `new-${kind}` : "closed")}
        open={creating || editing !== null}
        def={def}
        item={editing}
        engagementId={engagementId}
        access={access}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          onChanged();
        }}
      />
    </div>
  );
}

function ItemDialog({
  open,
  def,
  item,
  engagementId,
  access,
  onClose,
  onSaved,
}: {
  open: boolean;
  def: RegisterKindDef;
  item: RegisterItem | null;
  engagementId: string;
  access: ConsultingAccess;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const users = useAssignableUsers();
  const canEdit = item ? access.canUpdate : access.canCreate;
  const [title, setTitle] = useState(item?.title ?? "");
  const [status, setStatus] = useState(item?.status ?? def.statuses[0].value);
  const [priority, setPriority] = useState(item?.priority ?? "");
  const [ownerId, setOwnerId] = useState(item?.owner?.id ?? "");
  const [ownerName, setOwnerName] = useState(item?.ownerName ?? "");
  const [dueDate, setDueDate] = useState(item?.dueDate ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [details, setDetails] = useState<Record<string, string>>(() =>
    Object.fromEntries(def.details.map((f) => [f.key, item?.details[f.key] === undefined ? "" : String(item.details[f.key])]))
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The status list depends on the register; a new item opened on another register starts from its first status.
  useEffect(() => {
    if (!item) setStatus(def.statuses[0].value);
  }, [def, item]);

  const setDetail = (k: string) => (v: string) => setDetails((d) => ({ ...d, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleanDetails: Record<string, unknown> = {};
    for (const f of def.details) {
      const raw = (details[f.key] ?? "").trim();
      if (raw === "") continue;
      if (f.type === "number") {
        const n = Number(raw);
        if (!Number.isFinite(n)) return toast.error(`${f.label} must be a number`);
        cleanDetails[f.key] = n;
      } else {
        cleanDetails[f.key] = raw;
      }
    }
    setSaving(true);
    try {
      const body = {
        ...(item ? {} : { kind: def.kind }),
        title,
        status,
        priority: def.priorityLabel ? priority || null : null,
        ownerId: def.hasOwner ? ownerId || null : null,
        ownerName: def.hasOwner ? ownerName : null,
        dueDate: def.dueDateLabel ? dueDate || null : null,
        description,
        details: cleanDetails,
      };
      const res = await fetch(item ? `/api/consulting/items/${item.id}` : `/api/consulting/engagements/${engagementId}/items`, {
        method: item ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error(`Couldn't save the ${def.singular.toLowerCase()}`, data.error);
      toast.success(item ? `${def.singular} updated` : `${def.singular} added`);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item) return;
    const res = await fetch(`/api/consulting/items/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(`Couldn't delete the ${def.singular.toLowerCase()}`, data.error);
      return;
    }
    toast.success(`${def.singular} deleted`);
    onSaved();
  }

  const previewDetails: Record<string, unknown> = { ...details };
  const live =
    def.kind === "RISK"
      ? `Score: ${riskScore(previewDetails) ?? "—"}`
      : def.kind === "COMMERCIAL"
        ? `Total incl. tax: ${formatINR(commercialTotal(previewDetails))}`
        : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" onPointerDownOutside={(e) => e.preventDefault()}>
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>
              {item ? `${formatItemCode(item.kind, item.number)} · ${def.singular}` : `Add ${def.singular.toLowerCase()}`}
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <Field label={def.titleLabel} htmlFor="item-title">
              <Input id="item-title" value={title} onChange={(e) => setTitle(e.target.value)} required disabled={!canEdit} autoFocus={!item} />
            </Field>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Status">
                <Dropdown value={status} onChange={setStatus} options={def.statuses} disabled={!canEdit} />
              </Field>
              {def.priorityLabel && (
                <Field label={def.priorityLabel}>
                  <Dropdown value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} disabled={!canEdit} />
                </Field>
              )}
              {def.dueDateLabel && (
                <Field label={def.dueDateLabel}>
                  {canEdit ? <DatePicker value={dueDate} onChange={setDueDate} placeholder="Not set" /> : <Input value={formatDateKey(dueDate)} disabled />}
                </Field>
              )}
            </div>

            {def.hasOwner && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Owner (Aina)">
                  <Dropdown value={ownerId} onChange={setOwnerId} options={userOptions(users, "None")} disabled={!canEdit} />
                </Field>
                <Field label="Owner (client side)" htmlFor="item-owner-name">
                  <Input
                    id="item-owner-name"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Operations Head"
                    disabled={!canEdit}
                  />
                </Field>
              </div>
            )}

            {def.details.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {def.details.map((f) => (
                  <DetailInput key={f.key} field={f} value={details[f.key] ?? ""} onChange={setDetail(f.key)} disabled={!canEdit} />
                ))}
              </div>
            )}
            {live && <p className="text-sm font-medium">{live}</p>}

            <Field label={def.descriptionLabel} htmlFor="item-description">
              <Textarea
                id="item-description"
                rows={def.kind === "MEETING" ? 8 : 4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
              />
            </Field>
          </DialogBody>
          <DialogFooter className="justify-between">
            <div>
              {item && access.canDelete && (
                <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                {canEdit ? "Cancel" : "Close"}
              </Button>
              {canEdit && (
                <Button type="submit" disabled={saving || !title.trim()}>
                  {saving ? "Saving…" : item ? "Save changes" : `Add ${def.singular.toLowerCase()}`}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>

        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete this ${def.singular.toLowerCase()}?`}
          description="This permanently removes it from the register."
          confirmLabel="Delete"
          onConfirm={remove}
        />
      </DialogContent>
    </Dialog>
  );
}

function DetailInput({ field, value, onChange, disabled }: { field: DetailField; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const id = `detail-${field.key}`;
  const wide = field.type === "textarea";
  return (
    <Field label={field.label} htmlFor={id} className={wide ? "sm:col-span-2" : undefined}>
      {field.type === "textarea" ? (
        <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      ) : field.type === "select" ? (
        <Dropdown value={value} onChange={onChange} options={[{ value: "", label: "Not set" }, ...(field.options ?? [])]} disabled={disabled} />
      ) : field.type === "date" ? (
        disabled ? (
          <Input value={formatDateKey(value)} disabled />
        ) : (
          <DatePicker value={value} onChange={onChange} placeholder="Not set" />
        )
      ) : (
        <Input
          id={id}
          type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
          min={field.min}
          max={field.max}
          step={field.type === "number" ? "any" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.type === "url" ? "https://…" : undefined}
          disabled={disabled}
        />
      )}
    </Field>
  );
}
