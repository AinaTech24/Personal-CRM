import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { istDateKey, keyFromDate } from "@/lib/attendance";
import { birthdayInfo, birthdayWish } from "@/lib/birthdays";

/**
 * Everyone's birthday, soonest first. Open to every signed-in user — the whole
 * company sees who's celebrating — but only month/day go out: the birth year
 * (and so the age) is returned to admins alone.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = isAdmin(user);
  const todayKey = istDateKey();

  const people = await db.user.findMany({
    where: { isActive: true, birthday: { not: null } },
    select: { id: true, name: true, surname: true, avatarDataUrl: true, birthday: true, department: { select: { name: true } } },
  });

  const birthdays = people
    .map((p) => {
      const info = birthdayInfo(keyFromDate(p.birthday!), todayKey);
      const fullName = [p.name, p.surname].filter(Boolean).join(" ");
      return {
        id: p.id,
        name: fullName,
        avatarDataUrl: p.avatarDataUrl,
        department: p.department?.name ?? null,
        month: info.month,
        day: info.day,
        daysUntil: info.daysUntil,
        isToday: info.daysUntil === 0,
        wish: info.daysUntil === 0 ? birthdayWish(p.name) : null,
        ...(admin && { turning: info.turning }),
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name));

  return NextResponse.json({ todayKey, birthdays });
}
