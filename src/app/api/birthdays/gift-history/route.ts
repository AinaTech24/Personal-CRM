import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { istDateKey, keyFromDate } from "@/lib/attendance";
import { birthdayDateInYear } from "@/lib/birthdays";

/**
 * Gifts for birthdays that have already passed, newest first. Admins and a
 * Birthdays module grant-holder see everyone's — same "who can manage
 * gifts" boundary the roster/gift-set routes already use — anyone else sees
 * only the gifts given to them, since a gift can be free text and isn't
 * broadcast to the whole company after the day either.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = isAdmin(user) || (await canManageModule(user, "BIRTHDAYS", "READ"));
  const todayKey = istDateKey();

  const rows = await db.birthdayGift.findMany({
    where: admin ? {} : { userId: user.id },
    select: {
      year: true,
      gift: true,
      user: { select: { id: true, name: true, surname: true, avatarDataUrl: true, birthday: true } },
    },
  });

  const history = rows
    .filter((r) => r.user.birthday)
    .map((r) => {
      const born = keyFromDate(r.user.birthday!);
      const dateKey = birthdayDateInYear(Number(born.slice(5, 7)), Number(born.slice(8, 10)), r.year);
      return {
        userId: r.user.id,
        name: [r.user.name, r.user.surname].filter(Boolean).join(" "),
        avatarDataUrl: r.user.avatarDataUrl,
        year: r.year,
        dateKey,
        gift: r.gift,
      };
    })
    // Strictly past: today's gift is still showing in the live wish.
    .filter((h) => h.dateKey < todayKey)
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : a.name.localeCompare(b.name)));

  return NextResponse.json({ scope: admin ? "all" : "mine", history });
}
