"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription, useDialogState } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SkeletonTable } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { IconPlus } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { istDateKey } from "@/lib/attendance";
import { birthdayInfo } from "@/lib/birthdays";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import {
  CATEGORIES,
  categoryLabel,
  fmtKey,
  ProductStatusBadge,
  type ClientCategory,
  type ClientRow,
} from "@/components/clients/clients-shared";
import { cn } from "@/lib/utils";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function birthdayLabel(key: string) {
  const info = birthdayInfo(key, istDateKey());
  const day = format(new Date(2000, info.month - 1, info.day), "d MMM");
  if (info.daysUntil === 0) return `${day} · today 🎂`;
  return `${day} · in ${info.daysUntil} days`;
}

export function ClientsAdminView() {
  const toast = useToast();
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [category, setCategory] = useState<ClientCategory | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<ClientRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/clients");
    setClients(res.ok ? (await res.json()).clients : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: clients?.length ?? 0 };
    for (const cl of clients ?? []) c[cl.category] = (c[cl.category] ?? 0) + 1;
    return c;
  }, [clients]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients ?? []).filter(
      (c) =>
        (category === "ALL" || c.category === category) &&
        (!q || [c.name, c.ownerName, c.mobile, c.email, c.reason, ...c.team.map((m) => m.name)].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [clients, category, query]);

  // Keeps the detail dialog's content while it animates out after being closed.
  const detail = useDialogState(viewing);
  const c = detail.value;

  async function remove(target: ClientRow) {
    const res = await fetch(`/api/clients/${target.id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Couldn't delete the client");
    else toast.success("Client deleted", target.name);
    setViewing(null);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Client Accounts</h1>
          <p className="text-sm text-muted-foreground">Who we build for: category, owner details, team and product dates.</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <IconPlus className="h-4 w-4" />
          Add client
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "ALL", label: "All" }, ...CATEGORIES].map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setCategory(t.value as ClientCategory | "ALL")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                category === t.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-primary/5 hover:text-foreground"
              )}
            >
              {t.label} <span className="opacity-70">{counts[t.value] ?? 0}</span>
            </button>
          ))}
        </div>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients…" className="w-full sm:w-64" />
      </div>

      {!clients ? (
        <SkeletonTable rows={6} columns={5} />
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {clients.length === 0 ? "No clients yet. Add the first one." : "No clients match."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    {["Client", "Category", "Owner", "Team", "Product period", "Status"].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((cl) => (
                    <tr
                      key={cl.id}
                      onClick={() => setViewing(cl)}
                      className="cursor-pointer border-b border-border/50 align-top transition-colors last:border-0 hover:bg-primary/5"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{cl.name}</p>
                        {cl.reason && <p className="line-clamp-1 max-w-56 text-xs text-muted-foreground">{cl.reason}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{categoryLabel(cl.category)}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <p>{cl.ownerName}</p>
                        <p className="text-xs text-muted-foreground">{cl.mobile ?? cl.email ?? ""}</p>
                      </td>
                      <td className="px-4 py-3">
                        {cl.team.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex -space-x-1.5">
                            {cl.team.slice(0, 4).map((m) => (
                              <UserAvatar key={m.userId} name={m.name} avatarDataUrl={m.avatarDataUrl} className="h-6 w-6 ring-2 ring-card" />
                            ))}
                            {cl.team.length > 4 && (
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] ring-2 ring-card">
                                +{cl.team.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {cl.productStart || cl.productEnd ? `${fmtKey(cl.productStart)} → ${fmtKey(cl.productEnd)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <ProductStatusBadge client={cl} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={detail.open} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent size="lg">
          {c && (
            <>
              <DialogHeader>
                <DialogTitle>{c.name}</DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  <Badge variant="outline">{categoryLabel(c.category)}</Badge>
                  <ProductStatusBadge client={c} />
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="flex flex-col gap-4">
                {c.reason && <p className="rounded-md bg-muted/50 p-3 text-sm">{c.reason}</p>}
                <div className="divide-y divide-border/60">
                  <Field label="Owner">{c.ownerName}</Field>
                  <Field label="Mobile number">{c.mobile ?? "—"}</Field>
                  <Field label="Email ID">{c.email ?? "—"}</Field>
                  <Field label="Owner birthday">{c.ownerBirthday ? birthdayLabel(c.ownerBirthday) : "—"}</Field>
                  <Field label="Product start">{fmtKey(c.productStart)}</Field>
                  <Field label="Product end">{fmtKey(c.productEnd)}</Field>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Team</h3>
                  {c.team.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No one assigned yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {c.team.map((m) => (
                        <li key={m.userId} className="flex items-center gap-2 text-sm">
                          <UserAvatar name={m.name} avatarDataUrl={m.avatarDataUrl} className="h-7 w-7 text-xs" />
                          <span className="font-medium">{m.name}</span>
                          <span className="text-muted-foreground">· {m.role}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDeleteTarget(c)}>
                  Delete
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setEditing(c);
                    setViewing(null);
                    setFormOpen(true);
                  }}
                >
                  Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editing} onSaved={load} />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Delete this client?"
        description={deleteTarget ? `${deleteTarget.name} and its team assignments will be removed. This can't be undone.` : ""}
        onConfirm={() => (deleteTarget ? remove(deleteTarget) : undefined)}
      />
    </div>
  );
}
