import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { istDateKey, dateFromKey, elapsedMinutes } from "@/lib/attendance";

/** Employee self break-out — closes the open break and adds its length to today's cumulative break time. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = istDateKey();
  const date = dateFromKey(key);
  const now = new Date();

  const record = await db.attendance.findUnique({ where: { userId_date: { userId: user.id, date } } });
  if (!record?.breakIn) return NextResponse.json({ error: "You're not on a break" }, { status: 409 });

  const updated = await db.attendance.update({
    where: { id: record.id },
    data: { breakIn: null, breakMinutes: record.breakMinutes + elapsedMinutes(record.breakIn, now) },
  });
  return NextResponse.json({ record: updated });
}
