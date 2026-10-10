"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { IconCake } from "@/components/icons";

interface HistoryEntry {
  userId: string;
  name: string;
  avatarDataUrl: string | null;
  year: number;
  dateKey: string;
  gift: string;
}

/**
 * Gifts for birthdays that have passed. An admin sees everyone's; anyone else
 * sees only the ones given to them (the API decides, this just labels it).
 * `refreshKey` lets a parent re-fetch after it changes a gift.
 */
export function GiftHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<{ scope: "all" | "mine"; history: HistoryEntry[] } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/birthdays/gift-history")
      .then((r) => (r.ok ? r.json() : { scope: "mine", history: [] }))
      .then((d) => active && setData(d))
      .catch(() => active && setData({ scope: "mine", history: [] }));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const everyone = data?.scope === "all";

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">{everyone ? "Gift history" : "Your birthday gifts"}</h2>
        <p className="text-xs text-muted-foreground">
          {everyone ? "Gifts given on past birthdays." : "Gifts the Aina Family has sent you on past birthdays."}
        </p>
      </div>
      {!data ? (
        <Skeleton className="h-16 w-full" />
      ) : data.history.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <IconCake className="h-6 w-6" />
            No past gifts yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="divide-y divide-border/60 p-0">
            {data.history.map((h) => (
              <div key={`${h.userId}-${h.year}`} className="flex items-center gap-3 px-5 py-3">
                {everyone && <UserAvatar name={h.name} avatarDataUrl={h.avatarDataUrl} className="h-8 w-8 text-xs" />}
                <div className="min-w-0 flex-1">
                  {everyone && <p className="truncate text-sm font-medium">{h.name}</p>}
                  <p className={everyone ? "text-xs text-muted-foreground" : "text-sm font-medium"}>
                    {format(parseISO(h.dateKey), "d MMMM yyyy")}
                  </p>
                </div>
                <span className="max-w-[50%] break-words text-right text-sm">🎁 {h.gift}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
