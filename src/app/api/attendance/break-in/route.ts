import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { istDateKey, dateFromKey } from "@/lib/attendance";
import { isModuleBlocked } from "@/lib/module-permissions-store";

/**
 * Employee self break-in — pauses the work clock. Its length (to the
 * matching break-out, or to check-out if it's left open) is subtracted from
 * today's worked minutes.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "ATTENDANCE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const key = istDateKey();
  const date = dateFromKey(key);
  const now = new Date();

  const record = await db.attendance.findUnique({ where: { userId_date: { userId: user.id, date } } });
  if (!record?.checkIn) return NextResponse.json({ error: "You haven't checked in today" }, { status: 409 });
  if (record.checkOut) return NextResponse.json({ error: "You've already checked out today" }, { status: 409 });
  if (record.breakIn) return NextResponse.json({ error: "You're already on a break" }, { status: 409 });

  const updated = await db.attendance.update({ where: { id: record.id }, data: { breakIn: now } });
  return NextResponse.json({ record: updated });
}
