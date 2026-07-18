import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { DEFAULT_POLICY } from "@/lib/attendance";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await db.attendanceSettings.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    settings: {
      fullDayMinutes: row?.fullDayMinutes ?? DEFAULT_POLICY.fullDayMinutes,
      halfDayMinutes: row?.halfDayMinutes ?? DEFAULT_POLICY.halfDayMinutes,
      requireApproval: row?.requireApproval ?? DEFAULT_POLICY.requireApproval,
      requireHalfDayReason: row?.requireHalfDayReason ?? DEFAULT_POLICY.requireHalfDayReason,
      workingWeekdays: row?.workingWeekdays ?? DEFAULT_POLICY.workingWeekdays.join(","),
    },
  });
}

const bodySchema = z
  .object({
    fullDayMinutes: z.number().int().min(1).max(1440),
    halfDayMinutes: z.number().int().min(1).max(1440),
    requireApproval: z.boolean(),
    requireHalfDayReason: z.boolean(),
    // Comma list of JS getDay() numbers (0–6).
    workingWeekdays: z
      .string()
      .regex(/^([0-6])(,[0-6])*$/, "Must be day numbers 0–6")
      .refine((v) => new Set(v.split(",")).size === v.split(",").length, "Duplicate days"),
  })
  // A half day can't require more time than a full day.
  .refine((v) => v.halfDayMinutes < v.fullDayMinutes, {
    message: "Half day minimum must be less than full day minimum",
    path: ["halfDayMinutes"],
  });

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;

  await db.attendanceSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...d },
    update: d,
  });

  return NextResponse.json({ ok: true });
}
