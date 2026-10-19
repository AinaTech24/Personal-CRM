import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { istDateKey, keyFromDate } from "@/lib/attendance";
import { birthdayInfo } from "@/lib/birthdays";
import { notifyAndPush } from "@/lib/notify";

/**
 * Broadcasts a "Happy Birthday" notification to the whole company for
 * anyone whose birthday is today — same two ways in as the other reminder
 * routes: an admin trigger for testing, or a scheduler with the
 * CRON_SECRET header for the real schedule.
 *
 * Idempotent via a BirthdayWishSent row per (user, year), so the daily
 * sweep only ever sends this once per person per year even though it
 * checks every day.
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

  const celebrants = people
    .map((p) => ({ ...p, info: birthdayInfo(keyFromDate(p.birthday!), todayKey) }))
    .filter((p) => p.info.daysUntil === 0);

  if (celebrants.length === 0) return NextResponse.json({ checked: 0, sent: 0 });

  const alreadySent = await db.birthdayWishSent.findMany({
    where: { OR: celebrants.map((c) => ({ userId: c.id, year: c.info.year })) },
    select: { userId: true, year: true },
  });
  const sentSet = new Set(alreadySent.map((r) => `${r.userId}:${r.year}`));
  const due = celebrants.filter((c) => !sentSet.has(`${c.id}:${c.info.year}`));
  if (due.length === 0) return NextResponse.json({ checked: celebrants.length, sent: 0 });

  const everyone = await db.user.findMany({ where: { isActive: true }, select: { id: true } });

  let sent = 0;
  for (const celebrant of due) {
    const fullName = [celebrant.name, celebrant.surname].filter(Boolean).join(" ");
    const recipients = everyone.filter((u) => u.id !== celebrant.id);
    const results = await Promise.all(
      recipients.map((u) =>
        notifyAndPush(
          u.id,
          "birthday_today",
          { userId: celebrant.id, name: fullName },
          { title: "🎂 Happy Birthday!", body: `It's ${fullName}'s birthday today — wish them well!`, url: "/birthdays", tag: "birthday-today" }
        )
      )
    );
    if (results.some(Boolean)) sent += 1;

    await db.birthdayWishSent.create({ data: { userId: celebrant.id, year: celebrant.info.year } });
  }

  return NextResponse.json({ checked: celebrants.length, sent });
}
