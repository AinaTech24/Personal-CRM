import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { istDateKey, dateFromKey } from "@/lib/attendance";

/** Employee self check-in — stamps today's record. Idempotent-ish: refuses a second check-in. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = istDateKey();
  const date = dateFromKey(key);
  const now = new Date();

  const existing = await db.attendance.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });

  if (existing?.checkIn) {
    return NextResponse.json({ error: "You've already checked in today" }, { status: 409 });
  }

  const record = existing
    ? await db.attendance.update({ where: { id: existing.id }, data: { checkIn: now } })
    : await db.attendance.create({ data: { userId: user.id, date, checkIn: now } });

  return NextResponse.json({ record });
}
