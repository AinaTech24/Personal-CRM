import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getModuleGrantees } from "@/lib/module-permissions-store";
import { istDateKey, keyFromDate } from "@/lib/attendance";
import { birthdayInfo } from "@/lib/birthdays";
import { notifyAndPush } from "@/lib/notify";

/** Nag gift-pickers starting this many days before the birthday. */
const LEAD_DAYS = 7;

/**
 * Nudges every Admin/Super Admin plus whoever holds a BIRTHDAYS module grant
 * once someone's birthday is within the next week and no gift has been
 * chosen for it yet — same two ways in as the other reminder routes: an
 * admin trigger for testing, or a scheduler with the CRON_SECRET header for
 * the real schedule.
 *
 * Idempotent via a BirthdayGiftReminder row per (user, year) — a gift
 * eventually being chosen doesn't need to clear it, since once a reminder's
 * gone out for this year there's nothing left to re-nag about.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const providedSecret = req.headers.get("x-cron-secret");
  const viaCron = !!cronSecret && providedSecret === cronSecret;

  if (!viaCron) {
    const user = await getCurrentUser();
    if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const todayKey = istDateKey();
  const people = await db.user.findMany({
    where: { isActive: true, birthday: { not: null } },
    select: { id: true, name: true, surname: true, birthday: true },
  });

  const upcoming = people
    .map((p) => ({ ...p, info: birthdayInfo(keyFromDate(p.birthday!), todayKey) }))
    .filter((p) => p.info.daysUntil >= 0 && p.info.daysUntil <= LEAD_DAYS);

  if (upcoming.length === 0) return NextResponse.json({ checked: 0, sent: 0 });

  const [gifts, alreadyReminded] = await Promise.all([
    db.birthdayGift.findMany({
      where: { OR: upcoming.map((p) => ({ userId: p.id, year: p.info.year })) },
      select: { userId: true, year: true },
    }),
    db.birthdayGiftReminder.findMany({
      where: { OR: upcoming.map((p) => ({ userId: p.id, year: p.info.year })) },
      select: { userId: true, year: true },
    }),
  ]);
  const hasGift = new Set(gifts.map((g) => `${g.userId}:${g.year}`));
  const hasReminder = new Set(alreadyReminded.map((r) => `${r.userId}:${r.year}`));

  const due = upcoming.filter((p) => !hasGift.has(`${p.id}:${p.info.year}`) && !hasReminder.has(`${p.id}:${p.info.year}`));
  if (due.length === 0) return NextResponse.json({ checked: upcoming.length, sent: 0 });

  const [admins, grantees] = await Promise.all([
    db.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] } }, select: { id: true } }),
    getModuleGrantees("BIRTHDAYS"),
  ]);
  const giftPickerIds = new Set([...admins.map((a) => a.id), ...grantees.map((g) => g.userId)]);

  let sent = 0;

  for (const p of due) {
    const fullName = [p.name, p.surname].filter(Boolean).join(" ");
    const results = await Promise.all(
      Array.from(giftPickerIds).map((userId) =>
        notifyAndPush(
          userId,
          "birthday_gift_due",
          { userId: p.id, name: fullName, daysUntil: p.info.daysUntil },
          {
            title: "Birthday coming up",
            body:
              p.info.daysUntil === 0
                ? `It's ${fullName}'s birthday today — no gift picked yet.`
                : `${fullName}'s birthday is in ${p.info.daysUntil} day(s) — no gift picked yet.`,
            url: "/birthdays",
            tag: "birthday-gift-due",
          }
        )
      )
    );
    if (results.some(Boolean)) sent += 1;

    await db.birthdayGiftReminder.create({ data: { userId: p.id, year: p.info.year } });
  }

  return NextResponse.json({ checked: upcoming.length, sent });
}
