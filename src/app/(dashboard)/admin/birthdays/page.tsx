"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { SkeletonTable } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useToast } from "@/components/providers/toast-provider";
import { BIRTHDAY_GIFTS } from "@/lib/birthdays";

interface Row {
  id: string;
  name: string;
  surname: string | null;
  avatarDataUrl: string | null;
  isActive: boolean;
  department: { name: string } | null;
  birthday: string | null;
}

const toKey = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

const NO_GIFT = "NONE";
const GIFT_OPTIONS = [{ value: NO_GIFT, label: "No gift" }, ...BIRTHDAY_GIFTS.map((g) => ({ value: g.value, label: g.label }))];

export default function AdminBirthdaysPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  // Chosen gift for each person's next birthday, keyed by user id.
  const [gifts, setGifts] = useState<Record<string, string>>({});
  // Unsaved edits, keyed by user id.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [usersRes, birthdaysRes] = await Promise.all([fetch("/api/users"), fetch("/api/birthdays")]);
    if (!usersRes.ok) return setRows([]);
    setRows(((await usersRes.json()).users as Row[]).filter((u) => u.isActive));
    if (birthdaysRes.ok) {
      const list = (await birthdaysRes.json()).birthdays as { id: string; gift: string | null }[];
      setGifts(Object.fromEntries(list.filter((b) => b.gift).map((b) => [b.id, b.gift as string])));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(row: Row) {
    const value = draft[row.id];
    setSaving(row.id);
    try {
      const res = await fetch(`/api/users/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthday: value || null }),
      });
      if (!res.ok) return toast.error("Couldn't save birthday", "Check the date and try again.");
      toast.success("Birthday saved", row.name);
      setDraft((d) => {
        const rest = { ...d };
        delete rest[row.id];
        return rest;
      });
      await load();
    } finally {
      setSaving(null);
    }
  }

  async function chooseGift(row: Row, value: string) {
    const previous = gifts[row.id];
    // Optimistic: show the choice at once, roll back if the server refuses.
    setGifts((g) => {
      const next = { ...g };
      if (value === NO_GIFT) delete next[row.id];
      else next[row.id] = value;
      return next;
    });
    const res = await fetch(`/api/birthdays/${row.id}/gift`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gift: value === NO_GIFT ? null : value }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error("Couldn't save the gift", d.error);
      setGifts((g) => {
        const next = { ...g };
        if (previous) next[row.id] = previous;
        else delete next[row.id];
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Birthdays</h1>
        <p className="text-sm text-muted-foreground">
          Set each person&apos;s date of birth and choose a gift for their next birthday. On the day, everyone sees a
          birthday wish from the Aina Family, including the gift, on their dashboard and the Birthdays page. Colleagues
          see only the day and month, never the year, and the gift stays a surprise until the day.
        </p>
      </div>

      {!rows ? (
        <SkeletonTable rows={6} columns={4} />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/60 p-0">
            {rows.map((r) => {
              const full = [r.name, r.surname].filter(Boolean).join(" ");
              const current = draft[r.id] ?? toKey(r.birthday);
              const dirty = r.id in draft && draft[r.id] !== toKey(r.birthday);
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <UserAvatar name={full} avatarDataUrl={r.avatarDataUrl} className="h-8 w-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{full}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.department?.name ?? "No department"}</p>
                  </div>
                  <DatePicker
                    value={current}
                    onChange={(v) => setDraft((d) => ({ ...d, [r.id]: v }))}
                    placeholder="Add birthday"
                    className="w-44"
                  />
                  <Button size="sm" disabled={!dirty || saving === r.id} onClick={() => save(r)}>
                    {saving === r.id ? "Saving…" : "Save"}
                  </Button>
                  <Dropdown
                    size="sm"
                    className="w-32"
                    value={gifts[r.id] ?? NO_GIFT}
                    options={GIFT_OPTIONS}
                    // A gift belongs to a birthday, so there has to be a saved one first.
                    disabled={!r.birthday}
                    placeholder="Gift"
                    onChange={(v) => chooseGift(r, v)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
