import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { istDateKey, keyFromDate } from "@/lib/attendance";
import { birthdayInfo, birthdayWish } from "@/lib/birthdays";

/**
 * Everyone's birthday, soonest first. Open to every signed-in user — the whole
 * company sees who's celebrating — but only month/day go out: the birth year
 * (and so the age) is returned to admins (and a Birthdays module grant) alone.
 * The gift an admin picked is a surprise: admins/grant-holders always see it,
 * everyone else only on the day itself.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = isAdmin(user) || (await canManageModule(user, "BIRTHDAYS"));
  const todayKey = istDateKey();

  const people = await db.user.findMany({
    where: { isActive: true, birthday: { not: null } },
    select: { id: true, name: true, surname: true, avatarDataUrl: true, birthday: true, department: { select: { name: true } } },
  });

  const thisYear = Number(todayKey.slice(0, 4));
  const gifts = await db.birthdayGift.findMany({
    where: { userId: { in: people.map((p) => p.id) }, year: { in: [thisYear, thisYear + 1] } },
    select: { userId: true, year: true, gift: true },
  });

  const birthdays = people
    .map((p) => {
      const info = birthdayInfo(keyFromDate(p.birthday!), todayKey);
      const fullName = [p.name, p.surname].filter(Boolean).join(" ");
      const isToday = info.daysUntil === 0;
      const gift = gifts.find((g) => g.userId === p.id && g.year === info.year)?.gift ?? null;
      return {
        id: p.id,
        name: fullName,
        avatarDataUrl: p.avatarDataUrl,
        department: p.department?.name ?? null,
        month: info.month,
        day: info.day,
        daysUntil: info.daysUntil,
        isToday,
        gift: admin || isToday ? gift : null,
        wish: isToday ? birthdayWish(p.name, gift) : null,
        ...(admin && { turning: info.turning }),
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));

  return NextResponse.json({ todayKey, birthdays });
}
