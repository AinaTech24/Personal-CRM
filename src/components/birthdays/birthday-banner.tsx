"use client";

import Link from "next/link";
import { IconCake } from "@/components/icons";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useBirthdays } from "@/components/birthdays/use-birthdays";

/** Today's birthday wishes, shown to everyone at the top of the dashboard. Renders nothing on a quiet day. */
export function BirthdayBanner() {
  const birthdays = useBirthdays();
  const today = birthdays?.filter((b) => b.isToday) ?? [];
  if (today.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-amber-500/10 to-primary/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <IconCake className="h-5 w-5 text-primary" />
          {today.length === 1 ? "It's a birthday in the Aina Family today!" : `${today.length} birthdays in the Aina Family today!`}
        </div>
        <Link href="/birthdays" className="text-xs text-muted-foreground hover:text-foreground">
          All birthdays
        </Link>
      </div>
      <ul className="flex flex-col gap-3">
        {today.map((b) => (
          <li key={b.id} className="flex items-start gap-3">
            <UserAvatar name={b.name} avatarDataUrl={b.avatarDataUrl} className="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{b.name}</p>
              <p className="text-sm text-muted-foreground">{b.wish}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
