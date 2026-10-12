"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IconPlus, IconX } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { birthYearRange } from "@/lib/birthdays";
import { CATEGORIES, type ClientCategory, type ClientRow } from "@/components/clients/clients-shared";

interface PickerUser {
  id: string;
  name: string;
  surname: string | null;
  avatarDataUrl?: string | null;
}

interface TeamDraft {
  userId: string;
  role: string;
}

interface Form {
  name: string;
  category: ClientCategory;
  reason: string;
  ownerName: string;
  mobile: string;
  email: string;
  ownerBirthday: string;
  productStart: string;
  productEnd: string;
  team: TeamDraft[];
}

const EMPTY: Form = {
  name: "",
  category: "CRM",
  reason: "",
  ownerName: "",
  mobile: "",
  email: "",
  ownerBirthday: "",
  productStart: "",
  productEnd: "",
  team: [],
};

const fromClient = (c: ClientRow): Form => ({
  name: c.name,
  category: c.category,
  reason: c.reason ?? "",
  ownerName: c.ownerName,
  mobile: c.mobile ?? "",
  email: c.email ?? "",
  ownerBirthday: c.ownerBirthday ?? "",
  productStart: c.productStart ?? "",
  productEnd: c.productEnd ?? "",
  team: c.team.map((m) => ({ userId: m.userId, role: m.role })),
});

export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  client: ClientRow | null;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(EMPTY);
  const [users, setUsers] = useState<PickerUser[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset from the record each time the dialog opens, so a cancelled edit never leaks into the next one.
  useEffect(() => {
    if (open) setForm(client ? fromClient(client) : EMPTY);
  }, [open, client]);

  useEffect(() => {
    if (!open || users.length > 0) return;
    fetch("/api/users/assignable?scope=all")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers(d.users ?? []))
      .catch(() => {});
  }, [open, users.length]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const userOptions = users.map((u) => ({
    value: u.id,
    label: [u.name, u.surname].filter(Boolean).join(" "),
    avatarDataUrl: u.avatarDataUrl,
    showAvatar: true,
  }));

  const datesInvalid = form.productStart !== "" && form.productEnd !== "" && form.productEnd < form.productStart;
  const teamComplete = form.team.every((m) => m.userId && m.role.trim());
  const ready = form.name.trim() !== "" && form.ownerName.trim() !== "" && !datesInvalid && teamComplete;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const res = await fetch(client ? `/api/clients/${client.id}` : "/api/clients", {
        method: client ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          ownerBirthday: form.ownerBirthday || null,
          productStart: form.productStart || null,
          productEnd: form.productEnd || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save the client", data.error);
      toast.success(client ? "Client updated" : "Client added", form.name);
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent size="lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{client ? "Edit client" : "Add client"}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Client / business name</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={200} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Category</Label>
                <Dropdown value={form.category} onChange={(v) => set("category", v as ClientCategory)} options={CATEGORIES} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reason (why they came to us)</Label>
              <Textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={2} maxLength={2000} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Owner name</Label>
                <Input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} maxLength={200} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Mobile number</Label>
                <Input type="tel" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} maxLength={30} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Email ID</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} maxLength={200} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Owner birthday</Label>
                <DatePicker
                  value={form.ownerBirthday}
                  onChange={(v) => set("ownerBirthday", v)}
                  placeholder="Pick a date"
                  yearRange={birthYearRange()}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Product start date</Label>
                <DatePicker value={form.productStart} onChange={(v) => set("productStart", v)} placeholder="Pick a date" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Product end date</Label>
                <DatePicker value={form.productEnd} onChange={(v) => set("productEnd", v)} placeholder="Pick a date" />
              </div>
            </div>
            {datesInvalid && <p className="-mt-2 text-xs text-destructive">The end date can&apos;t be before the start date.</p>}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Team members</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => set("team", [...form.team, { userId: "", role: "" }])}>
                  <IconPlus className="h-3.5 w-3.5" />
                  Add member
                </Button>
              </div>
              {form.team.length === 0 && <p className="text-xs text-muted-foreground">No one assigned to this client yet.</p>}
              {form.team.map((m, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                  <Dropdown
                    value={m.userId}
                    placeholder="Team member"
                    // A person can only be on a client once; hide those already picked elsewhere.
                    options={userOptions.filter((o) => o.value === m.userId || !form.team.some((t) => t.userId === o.value))}
                    onChange={(v) => set("team", form.team.map((t, j) => (j === i ? { ...t, userId: v } : t)))}
                  />
                  <Input
                    value={m.role}
                    placeholder="Role (e.g. Developer)"
                    maxLength={100}
                    onChange={(e) => set("team", form.team.map((t, j) => (j === i ? { ...t, role: e.target.value } : t)))}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remove member"
                    onClick={() => set("team", form.team.filter((_, j) => j !== i))}
                  >
                    <IconX className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ready || saving}>
              {saving ? "Saving…" : client ? "Save changes" : "Add client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
