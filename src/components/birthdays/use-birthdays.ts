"use client";

import { useEffect, useState } from "react";

export interface BirthdayEntry {
  id: string;
  name: string;
  avatarDataUrl: string | null;
  department: string | null;
  month: number;
  day: number;
  daysUntil: number;
  isToday: boolean;
  wish: string | null;
  /** Free-text gift. Admins always; everyone else only on the day. */
  gift: string | null;
  /** Admin-only. */
  turning?: number;
}

export function useBirthdays() {
  const [birthdays, setBirthdays] = useState<BirthdayEntry[] | null>(null);
  const [canManageGifts, setCanManageGifts] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/birthdays")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!active) return;
        setBirthdays(Array.isArray(d?.birthdays) ? d.birthdays : []);
        setCanManageGifts(!!d?.canManageGifts);
      })
      .catch(() => {
        if (active) setBirthdays([]);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return { birthdays, canManageGifts, reload };
}
