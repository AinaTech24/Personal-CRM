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
  // "meetings" and "attendance" were missing here even though both were
  // already listed in NOTIFICATION_CATEGORIES — toggling either off/on in
  // Settings would 400 against this route.
  category: z.enum(["leads", "tasks", "projects", "quotations", "meetings", "attendance"]),
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
