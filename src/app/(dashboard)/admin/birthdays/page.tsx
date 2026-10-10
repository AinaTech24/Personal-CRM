"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { SkeletonTable } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useToast } from "@/components/providers/toast-provider";

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

export default function AdminBirthdaysPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  // Unsaved edits, keyed by user id.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/users");
    if (!res.ok) return setRows([]);
    const d = await res.json();
    setRows((d.users as Row[]).filter((u) => u.isActive));
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Birthdays</h1>
        <p className="text-sm text-muted-foreground">
          Set each person&apos;s date of birth. On the day, everyone sees a birthday wish from the Aina Family on their
          dashboard and the Birthdays page. Colleagues see only the day and month, never the year.
        </p>
      </div>

      {!rows ? (
        <SkeletonTable rows={6} columns={3} />
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
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
