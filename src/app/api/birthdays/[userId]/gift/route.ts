import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { istDateKey, keyFromDate } from "@/lib/attendance";
import { birthdayInfo, MAX_GIFT_LENGTH } from "@/lib/birthdays";

const bodySchema = z.object({ gift: z.string().trim().min(1).max(MAX_GIFT_LENGTH).nullable() });

/** Admin, or a Department Admin holding a Birthdays module grant: choose (or clear, with null) the gift for this person's next birthday. Free text: Hamper/Cake/Plant are only suggestions. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const user = await getCurrentUser();
  if (!user || (!isAdmin(user) && !(isDepartmentAdmin(user) && (await canManageModule(user, "BIRTHDAYS", "UPDATE"))))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { gift } = parsed.data;

  const { userId } = await params;
  const target = await db.user.findUnique({ where: { id: userId }, select: { birthday: true } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!target.birthday) {
    return NextResponse.json({ error: "Set this person's birthday first." }, { status: 400 });
  }

  // The gift belongs to the year of the upcoming birthday, so next year starts with none chosen.
  const { year } = birthdayInfo(keyFromDate(target.birthday), istDateKey());

  if (gift === null) {
    await db.birthdayGift.deleteMany({ where: { userId, year } });
  } else {
    await db.birthdayGift.upsert({
      where: { userId_year: { userId, year } },
      create: { userId, year, gift, createdById: user.id },
      update: { gift, createdById: user.id },
    });
  }
  return NextResponse.json({ gift, year });
}
