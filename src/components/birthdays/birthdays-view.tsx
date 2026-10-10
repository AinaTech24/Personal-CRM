"use client";

import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { IconCake } from "@/components/icons";
import { giftLabel } from "@/lib/birthdays";
import { useBirthdays, type BirthdayEntry } from "@/components/birthdays/use-birthdays";

const dayLabel = (b: BirthdayEntry) => format(new Date(2000, b.month - 1, b.day), "MMMM d");

function untilLabel(days: number) {
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function BirthdaysView() {
  const birthdays = useBirthdays();

  if (!birthdays) return <SkeletonList rows={6} />;

  const today = birthdays.filter((b) => b.isToday);
  const upcoming = birthdays.filter((b) => !b.isToday);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Birthdays</h1>
        <p className="text-sm text-muted-foreground">Celebrating everyone in the Aina Family.</p>
      </div>

      {today.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Today</h2>
          {today.map((b) => (
            <Card key={b.id} className="border-primary/20 bg-gradient-to-r from-primary/10 via-amber-500/10 to-primary/5">
              <CardContent className="flex items-start gap-4 p-5">
                <UserAvatar name={b.name} avatarDataUrl={b.avatarDataUrl} className="h-12 w-12 text-base" />
                <div className="min-w-0">
                  <p className="font-semibold">{b.name}</p>
                  {b.department && <p className="text-xs text-muted-foreground">{b.department}</p>}
                  <p className="mt-2 text-sm">{b.wish}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <IconCake className="h-6 w-6" />
              {today.length === 0 ? "No birthdays have been added yet." : "No other birthdays to show."}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y divide-border/60 p-0">
              {upcoming.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-5 py-3">
                  <UserAvatar name={b.name} avatarDataUrl={b.avatarDataUrl} className="h-8 w-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{b.name}</p>
                    {b.department && <p className="truncate text-xs text-muted-foreground">{b.department}</p>}
                  </div>
                  {b.gift && <Badge variant="secondary">🎁 {giftLabel(b.gift)}</Badge>}
                  <div className="text-right text-sm">
                    <p className="font-medium">{dayLabel(b)}</p>
                    <p className="text-xs text-muted-foreground">{untilLabel(b.daysUntil)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
