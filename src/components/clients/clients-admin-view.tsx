"use client";

import { useCallback, useEffect, useState } from "react";
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
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
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

/** How many clients a single fetch loads — both the initial page and each "Load more". */
const PAGE_SIZE = 50;

export function ClientsAdminView() {
  const toast = useToast();
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({ ALL: 0 });
  const [category, setCategory] = useState<ClientCategory | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<ClientRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);

  // Debounced so typing into search doesn't fire a request per keystroke.
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  function clientsFetchUrl(take: number, skip: number) {
    const params = new URLSearchParams();
    if (category !== "ALL") params.set("category", category);
    if (q) params.set("q", q);
    params.set("take", String(take));
    if (skip) params.set("skip", String(skip));
    return `/api/clients?${params.toString()}`;
  }

  // The one reactive fetch: re-runs (resetting to the first page) whenever
  // the category or search changes — both now filter server-side, so this
  // is also what makes "Load more" safe. `take` lets a post-mutation
  // refresh ask for as many as were already loaded, instead of collapsing
  // the table back to page one. The category tabs' own counts always come
  // from the response's company-wide `counts`, never from `clients.length`.
  const load = useCallback(
    async (take: number = PAGE_SIZE) => {
      const res = await fetch(clientsFetchUrl(Math.max(take, PAGE_SIZE), 0));
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setClients(data.clients ?? []);
        setTotal(data.total ?? 0);
        setHasMore(!!data.hasMore);
        setCounts(data.counts ?? { ALL: 0 });
      } else {
        setClients([]);
      }
    },
    [category, q] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function loadMoreClients() {
    setLoadingMore(true);
    try {
      const res = await fetch(clientsFetchUrl(PAGE_SIZE, clients?.length ?? 0));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't load more clients", data.error);
      setClients((prev) => [...(prev ?? []), ...(data.clients ?? [])]);
      setTotal(data.total ?? 0);
      setHasMore(!!data.hasMore);
      setCounts(data.counts ?? { ALL: 0 });
    } finally {
      setLoadingMore(false);
    }
  }

  // Preserves however many clients were already loaded (via "Load more"),
  // rather than collapsing the table back to page one.
  function refreshClients() {
    return load(clients?.length ?? PAGE_SIZE);
  }

  useEffect(() => {
    load();
  }, [load]);

  // Keeps the detail dialog's content while it animates out after being closed.
  const detail = useDialogState(viewing);
  const c = detail.value;

  async function remove(target: ClientRow) {
    const res = await fetch(`/api/clients/${target.id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Couldn't delete the client");
    else toast.success("Client deleted", target.name);
    setViewing(null);
    refreshClients();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xl font-semibold">Clients</h1>
          <HelpDialog title="Clients — help">
            <HelpSection heading="What this page is for">
              <p>A company-wide directory of who you build for — category, owner contact details, which team handles them, and product dates. This is separate from the Social Media module&apos;s own Clients list.</p>
            </HelpSection>
            <HelpSection heading="Who can see this">
              <p>Admins and Super Admins only.</p>
            </HelpSection>
          </HelpDialog>
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
      ) : clients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {counts.ALL === 0 ? "No clients yet. Add the first one." : "No clients match."}
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
                  {clients.map((cl) => (
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

      {clients && clients.length > 0 && (
        <div className="flex items-center justify-center gap-3 py-1">
          <span className="text-xs text-muted-foreground">
            Showing {clients.length} of {total} client{total === 1 ? "" : "s"}
          </span>
          {hasMore && (
            <Button type="button" variant="outline" size="sm" onClick={loadMoreClients} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>
      )}

      <Dialog open={detail.open} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent size="lg">
          {c && (
            <>
              <DialogHeader>
                <DialogTitle>{c.name}</DialogTitle>
                <DialogDescription className="sr-only">Client details</DialogDescription>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{categoryLabel(c.category)}</Badge>
                  <ProductStatusBadge client={c} />
                </div>
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

      <ClientFormDialog open={formOpen} onOpenChange={setFormOpen} client={editing} onSaved={refreshClients} />
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
