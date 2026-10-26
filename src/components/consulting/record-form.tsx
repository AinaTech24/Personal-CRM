"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/dropdown";
import { useToast } from "@/components/providers/toast-provider";
import { inputValue, parseInput } from "@/lib/mfd/format";
import type { FieldMeta, Labels, Row } from "@/lib/mfd/ui-types";
import { LookupInput } from "./lookup-input";

const LONG_TEXT = new Set(["text", "json"]);

/**
 * Create/edit form for any Command Centre table, driven by the field
 * dictionary. Server-owned fields aren't editable; `fixed` pins values the
 * context decides (the parent record, the MFD) and hides those inputs.
 * Reference pickers are narrowed to the record's MFD once one is chosen.
 */
export function RecordForm({
  slug,
  table,
  fields,
  record,
  labels,
  fixed,
  onDone,
  submitLabel,
}: {
  slug: string;
  table: string;
  fields: FieldMeta[];
  record?: Row | null;
  labels?: Labels;
  fixed?: Row;
  /** Called after a successful save; by default the page navigates to the record. */
  onDone?: (saved: Row) => void;
  submitLabel?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = !!record;
  const editable = useMemo(() => fields.filter((f) => !f.server && !(fixed && f.column in fixed)), [fields, fixed]);

  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const v: Record<string, string | boolean> = {};
    for (const f of editable) v[f.column] = f.kind === "bool" ? !!record?.[f.column] : inputValue(f, record?.[f.column]);
    return v;
  });
  const [lookupLabels, setLookupLabels] = useState<Record<string, string | null>>(() => {
    const l: Record<string, string | null> = {};
    for (const f of editable) {
      const id = record?.[f.column];
      if (f.lookup && typeof id === "string") l[f.column] = labels?.[f.column]?.[id] ?? null;
    }
    return l;
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const orgId = (fixed?.mfd_org_id as string | undefined) ?? ((values.mfd_org_id as string) || (record?.mfd_org_id as string | undefined) || null);

  const set = (col: string, v: string | boolean) => setValues((s) => ({ ...s, [col]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors([]);
    const body: Row = { ...(fixed ?? {}) };
    const parseErrors: string[] = [];
    for (const f of editable) {
      const raw = values[f.column];
      let v: unknown;
      try {
        v = parseInput(f, raw);
      } catch {
        parseErrors.push(`${f.label}: invalid JSON.`);
        continue;
      }
      if (editing) {
        const before = inputValue(f, record?.[f.column]);
        const same = f.kind === "bool" ? !!record?.[f.column] === raw : before === raw;
        if (same) continue;
      } else if (v === null) continue;
      body[f.column] = v;
    }
    if (parseErrors.length) return setErrors(parseErrors);
    if (editing) body.row_version = record!.row_version;
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/v1/${slug}/${record!.id as string}` : `/api/v1/${slug}`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors(data.details?.length ? data.details : [data.error ?? "Couldn't save"]);
        return;
      }
      toast.success(editing ? "Saved" : "Created");
      if (onDone) onDone(data);
      else router.push(`/consulting/${table}/${data.id as string}`);
      router.refresh();
    } catch {
      setErrors(["Network error — try again."]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {editable.map((f) => {
          const id = `f-${table}-${f.column}`;
          const wide = LONG_TEXT.has(f.kind);
          const req = f.required === "Y" && f.kind !== "bool";
          return (
            <div key={f.column} className={wide ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
              <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
                {f.label}
                {req && <span className="text-destructive"> *</span>}
              </label>
              {f.kind === "bool" ? (
                <label className="flex h-9 items-center gap-2 text-sm">
                  <input id={id} type="checkbox" checked={!!values[f.column]} onChange={(e) => set(f.column, e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
                  <span className="text-muted-foreground">{f.help || "Yes"}</span>
                </label>
              ) : f.options ? (
                <Dropdown
                  id={id}
                  value={String(values[f.column] ?? "")}
                  onChange={(v) => set(f.column, v)}
                  options={[...(req ? [] : [{ value: "", label: "—" }]), ...f.options]}
                  placeholder="Choose…"
                />
              ) : f.lookup ? (
                <LookupInput
                  id={id}
                  url={f.lookup.url}
                  value={(values[f.column] as string) || null}
                  label={lookupLabels[f.column]}
                  filters={f.lookup.module && f.column !== "mfd_org_id" && f.lookup.table !== "team_members" && f.lookup.table !== "mfd_organizations" ? { mfd_org_id: orgId } : undefined}
                  onChange={(v, l) => {
                    set(f.column, v ?? "");
                    setLookupLabels((s) => ({ ...s, [f.column]: l }));
                  }}
                />
              ) : f.kind === "text" || f.kind === "json" ? (
                <Textarea
                  id={id}
                  rows={f.kind === "json" ? 4 : 3}
                  value={String(values[f.column] ?? "")}
                  onChange={(e) => set(f.column, e.target.value)}
                  className={f.kind === "json" ? "font-mono text-xs" : undefined}
                  placeholder={f.kind === "json" ? "JSON" : undefined}
                />
              ) : (
                <Input
                  id={id}
                  type={f.kind === "date" ? "date" : f.kind === "datetime" ? "datetime-local" : ["int", "bigint", "decimal"].includes(f.kind) ? "number" : "text"}
                  step={f.kind === "decimal" ? (f.scale ? String(1 / 10 ** f.scale) : "any") : undefined}
                  maxLength={f.maxLength}
                  value={String(values[f.column] ?? "")}
                  onChange={(e) => set(f.column, e.target.value)}
                />
              )}
              {f.help && f.kind !== "bool" && <p className="text-[11px] leading-snug text-muted-foreground/80">{f.help}</p>}
            </div>
          );
        })}
      </div>
      {errors.length > 0 && (
        <ul className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : (submitLabel ?? (editing ? "Save changes" : "Create"))}
        </Button>
      </div>
    </form>
  );
}
