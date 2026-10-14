"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { SkeletonTable } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useToast } from "@/components/providers/toast-provider";
import { GiftHistory } from "@/components/birthdays/gift-history";
import { BIRTHDAY_GIFTS, MAX_GIFT_LENGTH, birthYearRange } from "@/lib/birthdays";

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

const NO_GIFT = "__none__";
const OTHER = "__other__";
const GIFT_OPTIONS = [
  { value: NO_GIFT, label: "No gift" },
  ...BIRTHDAY_GIFTS.map((g) => ({ value: g, label: g })),
  { value: OTHER, label: "Other (type your own)" },
];
const isPreset = (g: string) => (BIRTHDAY_GIFTS as readonly string[]).includes(g);

export default function AdminBirthdaysPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  // The gift chosen for each person's next birthday, keyed by user id.
  const [gifts, setGifts] = useState<Record<string, string>>({});
  // Text being typed for a custom gift. A key's presence means "Other" is selected for that person.
  const [custom, setCustom] = useState<Record<string, string>>({});
  // Unsaved birthday edits, keyed by user id.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    const [usersRes, birthdaysRes] = await Promise.all([fetch("/api/birthdays/roster"), fetch("/api/birthdays")]);
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

  /** Saves (or, with null, clears) the gift for this person's next birthday. */
  async function saveGift(row: Row, gift: string | null) {
    const previous = gifts[row.id];
    setSaving(`gift-${row.id}`);
    try {
      const res = await fetch(`/api/birthdays/${row.id}/gift`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gift }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("Couldn't save the gift", d.error);
        // Put the controls back to what is actually saved.
        setCustom((c) => {
          const next = { ...c };
          if (previous && !isPreset(previous)) next[row.id] = previous;
          else delete next[row.id];
          return next;
        });
        return;
      }
      setGifts((g) => {
        const next = { ...g };
        if (gift) next[row.id] = gift;
        else delete next[row.id];
        return next;
      });
      setHistoryKey((k) => k + 1);
    } finally {
      setSaving(null);
    }
  }

  function onGiftSelect(row: Row, value: string) {
    if (value === OTHER) {
      const saved = gifts[row.id];
      setCustom((c) => ({ ...c, [row.id]: saved && !isPreset(saved) ? saved : "" }));
      return;
    }
    setCustom((c) => {
      const next = { ...c };
      delete next[row.id];
      return next;
    });
    saveGift(row, value === NO_GIFT ? null : value);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Birthdays</h1>
        <p className="text-sm text-muted-foreground">
          Set each person&apos;s date of birth and choose a gift for their next birthday: pick Hamper, Cake or Plant, or
          choose Other and type anything you like. On the day, everyone sees a birthday wish from the Aina Family,
          including the gift, on their dashboard and the Birthdays page. Colleagues see only the day and month, never
          the year, and the gift stays a surprise until the day.
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

              const saved = gifts[r.id];
              // A saved gift that isn't one of the suggestions is a custom one: show it in the text box.
              const customText = custom[r.id] ?? (saved && !isPreset(saved) ? saved : undefined);
              const selected = customText !== undefined ? OTHER : saved && isPreset(saved) ? saved : NO_GIFT;
              const customDirty = customText !== undefined && customText.trim() !== "" && customText.trim() !== (saved ?? "");

              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <UserAvatar name={full} avatarDataUrl={r.avatarDataUrl} className="h-8 w-8 text-xs" />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-medium">{full}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.department?.name ?? "No department"}</p>
                  </div>
                  <DatePicker
                    value={current}
                    onChange={(v) => setDraft((d) => ({ ...d, [r.id]: v }))}
                    placeholder="Add birthday"
                    yearRange={birthYearRange()}
                    className="w-44"
                  />
                  <Button size="sm" disabled={!dirty || saving === r.id} onClick={() => save(r)}>
                    {saving === r.id ? "Saving…" : "Save"}
                  </Button>
                  <Dropdown
                    size="sm"
                    className="w-44"
                    value={selected}
                    options={GIFT_OPTIONS}
                    // A gift belongs to a birthday, so there has to be a saved one first.
                    disabled={!r.birthday}
                    placeholder="Gift"
                    onChange={(v) => onGiftSelect(r, v)}
                  />
                  {customText !== undefined && (
                    <div className="flex items-center gap-2">
                      <Input
                        value={customText}
                        maxLength={MAX_GIFT_LENGTH}
                        placeholder="Type the gift…"
                        className="h-8 w-48"
                        onChange={(e) => setCustom((c) => ({ ...c, [r.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && customDirty) saveGift(r, customText.trim());
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={!customDirty || saving === `gift-${r.id}`}
                        onClick={() => saveGift(r, customText.trim())}
                      >
                        {saving === `gift-${r.id}` ? "Saving…" : "Set gift"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <GiftHistory refreshKey={historyKey} />
    </div>
  );
}
