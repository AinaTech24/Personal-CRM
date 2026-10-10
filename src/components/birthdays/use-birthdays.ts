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
  /** HAMPER | CAKE | PLANT. Admins always; everyone else only on the day. */
  gift: string | null;
  /** Admin-only. */
  turning?: number;
}

export function useBirthdays() {
  const [birthdays, setBirthdays] = useState<BirthdayEntry[] | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/birthdays")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active) setBirthdays(Array.isArray(d?.birthdays) ? d.birthdays : []);
      })
      .catch(() => {
        if (active) setBirthdays([]);
      });
    return () => {
      active = false;
    };
  }, []);

  return birthdays;
}
