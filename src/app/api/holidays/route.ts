import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { dateFromKey, keyFromDate } from "@/lib/attendance";

/** Any signed-in user can read holidays — the employee calendar needs them to colour non-working days. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.holiday.findMany({ orderBy: { date: "asc" } });
  return NextResponse.json({ holidays: rows.map((h) => ({ id: h.id, date: keyFromDate(h.date), name: h.name })) });
}

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  name: z.string().trim().min(1).max(120),
});

/** Admin, or a Department Admin holding an Attendance module grant, adds a holiday. Unique per date — re-adding the same date updates its name. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (!isAdmin(user) && !(isDepartmentAdmin(user) && (await canManageModule(user, "ATTENDANCE", "CREATE"))))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { date, name } = parsed.data;

  const holiday = await db.holiday.upsert({
    where: { date: dateFromKey(date) },
    create: { date: dateFromKey(date), name },
    update: { name },
  });

  return NextResponse.json({ holiday: { id: holiday.id, date: keyFromDate(holiday.date), name: holiday.name } });
}
