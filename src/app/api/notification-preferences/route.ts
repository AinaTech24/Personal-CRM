import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@/lib/notify";

/** Returns every category with its current toggle (missing row = on, the default). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db.notificationPreference.findMany({ where: { userId: user.id } });
  const overrides = new Map(rows.map((r) => [r.category, r.inApp]));

  return NextResponse.json({
    preferences: NOTIFICATION_CATEGORIES.map((c) => ({
      category: c.value,
      label: c.label,
      description: c.description,
      inApp: overrides.get(c.value) ?? true,
    })),
  });
}

const bodySchema = z.object({
  // This list has repeatedly drifted behind NOTIFICATION_CATEGORIES as new
  // categories were added there — each gap meant toggling that category
  // off/on in Settings would 400 against this route (first "meetings" and
  // "attendance", then "calls"/"forms"/"billing"/"passwords"/"birthdays",
  // now "expenses"/"consulting"/"leaves"). Kept in sync by hand since zod
  // needs a literal union, not a runtime array of NOTIFICATION_CATEGORIES's
  // values.
  category: z.enum([
    "leads",
    "tasks",
    "projects",
    "quotations",
    "meetings",
    "attendance",
    "leaves",
    "social",
    "calls",
    "expenses",
    "forms",
    "billing",
    "passwords",
    "birthdays",
    "consulting",
  ]),
  inApp: z.boolean(),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { category, inApp } = parsed.data as { category: NotificationCategory; inApp: boolean };

  await db.notificationPreference.upsert({
    where: { userId_category: { userId: user.id, category } },
    create: { userId: user.id, category, inApp },
    update: { inApp },
  });

  return NextResponse.json({ ok: true });
}
