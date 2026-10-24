"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/providers/toast-provider";
import { LookupInput } from "./lookup-input";

export interface ActionPrompt {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "datetime" | "checkbox" | "lookup" | "file";
  required?: boolean;
  /** For lookups: search URL returning {items}. */
  url?: string;
  help?: string;
}

export interface ActionDef {
  action: string;
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  confirm?: string;
  prompts?: ActionPrompt[];
  /** Where to go with the result: "self" refreshes, "result" opens the returned record, "org" opens the converted MFD. */
  then?: "self" | "result" | "org" | "link";
}

/** Buttons for a record's workflow actions (POST /api/v1/{slug}/{id}/{action}). */
export function ActionBar({ slug, table, id, rowVersion, actions }: { slug: string; table: string; id: string; rowVersion?: number; actions: ActionDef[] }) {
  const [active, setActive] = useState<ActionDef | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; note: string } | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function run(def: ActionDef, values: Record<string, unknown>, file?: File | null) {
    setBusy(def.action);
    try {
      let res: Response;
      if (file) {
        const form = new FormData();
        form.set("file", file);
        for (const [k, v] of Object.entries(values)) if (v !== undefined && v !== null && v !== "") form.set(k, String(v));
        res = await fetch(`/api/v1/${slug}/${id}/${def.action}`, { method: "POST", body: form });
      } else {
        res = await fetch(`/api/v1/${slug}/${id}/${def.action}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(rowVersion !== undefined ? { row_version: rowVersion } : {}), ...values }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details: string[] = Array.isArray(data.details) ? data.details.filter((d: unknown) => typeof d === "string" && !/^[0-9a-f-]{36}$/.test(d)) : [];
        toast.error(data.error ?? "That didn't work", details.slice(0, 4).join(" · ") || undefined);
        return false;
      }
      toast.success(`${def.label} — done`);
      setActive(null);
      if (def.then === "link" && typeof data?.url === "string") {
        const expires = typeof data.expires_at === "string" ? new Date(data.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
        setLink({ url: data.url, note: `${data.emailed ? `Emailed to ${data.emailed as string}. ` : ""}${expires ? `Expires ${expires}.` : ""}` });
      }
      if (def.then === "result" && data?.id) router.push(`/consulting/${table}/${data.id as string}`);
      else if (def.then === "org" && data?.mfd_org_id) router.push(`/consulting/mfd_organizations/${data.mfd_org_id as string}`);
      router.refresh();
      return true;
    } catch {
      toast.error("Network error — try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.action}
            size="sm"
            variant={a.variant ?? "outline"}
            disabled={!!busy}
            onClick={() => {
              if (a.prompts?.length) setActive(a);
              else if (!a.confirm || window.confirm(a.confirm)) void run(a, {});
            }}
          >
            {busy === a.action ? "Working…" : a.label}
          </Button>
        ))}
      </div>
      {active && <PromptDialog def={active} busy={busy === active.action} onClose={() => setActive(null)} onSubmit={(v, f) => run(active, v, f)} />}
      {link && (
        <Dialog open onOpenChange={(o) => !o && setLink(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Respondent link</DialogTitle>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Personal to this assessment&apos;s client contact — anyone with it can answer, so share it only with them. {link.note}</p>
              <Input readOnly value={link.url} onFocus={(e) => e.target.select()} />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link.url).catch(() => {});
                    toast.success("Link copied");
                  }}
                >
                  Copy link
                </Button>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function PromptDialog({
  def,
  busy,
  onClose,
  onSubmit,
}: {
  def: ActionDef;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, unknown>, file: File | null) => Promise<boolean>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [labels, setLabels] = useState<Record<string, string | null>>({});
  const [file, setFile] = useState<File | null>(null);
  const set = (k: string, v: unknown) => setValues((s) => ({ ...s, [k]: v }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{def.label}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const out: Record<string, unknown> = {};
              for (const p of def.prompts ?? []) {
                const v = values[p.name];
                if (p.type === "number") out[p.name] = v === "" || v === undefined ? undefined : v;
                else if (p.type === "datetime") out[p.name] = v ? new Date(`${v as string}:00+05:30`).toISOString() : undefined;
                else out[p.name] = v;
              }
              void onSubmit(out, file);
            }}
          >
            {def.confirm && <p className="text-sm text-muted-foreground">{def.confirm}</p>}
            {(def.prompts ?? []).map((p) => (
              <div key={p.name} className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {p.label}
                  {p.required && <span className="text-destructive"> *</span>}
                </label>
                {p.type === "textarea" ? (
                  <Textarea rows={3} required={p.required} value={String(values[p.name] ?? "")} onChange={(e) => set(p.name, e.target.value)} />
                ) : p.type === "checkbox" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!values[p.name]} onChange={(e) => set(p.name, e.target.checked)} className="h-4 w-4" />
                    {p.help}
                  </label>
                ) : p.type === "lookup" ? (
                  <LookupInput
                    url={p.url!}
                    value={(values[p.name] as string) ?? null}
                    label={labels[p.name]}
                    onChange={(v, l) => {
                      set(p.name, v);
                      setLabels((s) => ({ ...s, [p.name]: l }));
                    }}
                  />
                ) : p.type === "file" ? (
                  <input
                    type="file"
                    required={p.required}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:text-primary"
                  />
                ) : (
                  <Input
                    type={p.type === "number" ? "number" : p.type === "datetime" ? "datetime-local" : "text"}
                    step={p.type === "number" ? "any" : undefined}
                    required={p.required}
                    value={String(values[p.name] ?? "")}
                    onChange={(e) => set(p.name, e.target.value)}
                  />
                )}
                {p.help && p.type !== "checkbox" && <p className="text-[11px] text-muted-foreground">{p.help}</p>}
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant={def.variant === "destructive" ? "destructive" : "default"} disabled={busy}>
                {busy ? "Working…" : def.label}
              </Button>
            </div>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
