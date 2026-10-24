"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconCake } from "@/components/icons";
import { useToast } from "@/components/providers/toast-provider";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { GiftHistory } from "@/components/birthdays/gift-history";
import { useBirthdays, type BirthdayEntry } from "@/components/birthdays/use-birthdays";
import { BIRTHDAY_GIFTS, MAX_GIFT_LENGTH } from "@/lib/birthdays";

const dayLabel = (b: BirthdayEntry) => format(new Date(2000, b.month - 1, b.day), "MMMM d");

function untilLabel(days: number) {
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

const NO_GIFT = "__none__";
const OTHER = "__other__";
const GIFT_OPTIONS = [
  { value: NO_GIFT, label: "No gift" },
  ...BIRTHDAY_GIFTS.map((g) => ({ value: g, label: g })),
  { value: OTHER, label: "Other (type your own)" },
];
const isPreset = (g: string) => (BIRTHDAY_GIFTS as readonly string[]).includes(g);

export function BirthdaysView() {
  const { birthdays, canManageGifts, reload } = useBirthdays();
  const toast = useToast();
  const [customFor, setCustomFor] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [sending, setSending] = useState<string | null>(null);

  if (!birthdays) return <SkeletonList rows={6} />;

  const today = birthdays.filter((b) => b.isToday);
  const upcoming = birthdays.filter((b) => !b.isToday);

  async function sendGift(b: BirthdayEntry, gift: string | null) {
    setSending(b.id);
    try {
      const res = await fetch(`/api/birthdays/${b.id}/gift`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gift }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't send the gift", data.error);
      toast.success(gift ? "Gift set" : "Gift cleared", b.name);
      setCustomFor(null);
      setCustomText("");
      reload();
    } finally {
      setSending(null);
    }
  }

  function onGiftSelect(b: BirthdayEntry, value: string) {
    if (value === OTHER) {
      setCustomFor(b.id);
      setCustomText(b.gift && !isPreset(b.gift) ? b.gift : "");
      return;
    }
    sendGift(b, value === NO_GIFT ? null : value);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1.5">
        <h1 className="text-xl font-semibold">Birthdays</h1>
        <HelpDialog title="Birthdays — help">
          <HelpSection heading="What this page is for">
            <p>See who&apos;s celebrating today and who&apos;s coming up next. On someone&apos;s birthday you can send them a wish, and an admin may send a company gift.</p>
          </HelpSection>
        </HelpDialog>
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
              {upcoming.map((b) => {
                const showCustom = customFor === b.id;
                const selected = showCustom ? OTHER : b.gift && isPreset(b.gift) ? b.gift : NO_GIFT;
                const customDirty = showCustom && customText.trim() !== "" && customText.trim() !== (b.gift ?? "");
                return (
                  <div key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <UserAvatar name={b.name} avatarDataUrl={b.avatarDataUrl} className="h-8 w-8 text-xs" />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate text-sm font-medium">{b.name}</p>
                      {b.department && <p className="truncate text-xs text-muted-foreground">{b.department}</p>}
                    </div>
                    {b.gift && <Badge variant="secondary">🎁 {b.gift}</Badge>}
                    <div className="text-right text-sm">
                      <p className="font-medium">{dayLabel(b)}</p>
                      <p className="text-xs text-muted-foreground">{untilLabel(b.daysUntil)}</p>
                    </div>
                    {canManageGifts && (
                      <div className="flex items-center gap-2">
                        <Dropdown
                          size="sm"
                          className="w-40"
                          value={selected}
                          options={GIFT_OPTIONS}
                          placeholder="Send a gift"
                          disabled={sending === b.id}
                          onChange={(v) => onGiftSelect(b, v)}
                        />
                        {showCustom && (
                          <>
                            <Input
                              value={customText}
                              maxLength={MAX_GIFT_LENGTH}
                              placeholder="Type the gift…"
                              className="h-8 w-40"
                              onChange={(e) => setCustomText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && customDirty) sendGift(b, customText.trim());
                              }}
                            />
                            <Button size="sm" disabled={!customDirty || sending === b.id} onClick={() => sendGift(b, customText.trim())}>
                              {sending === b.id ? "Sending…" : "Send"}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>

      <GiftHistory />
    </div>
  );
}
