import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { getLeavePolicy } from "@/lib/leave";

/** Anyone signed in can read it — a Department User's own "My Leave" page shows the same numbers Admin > Leave Requests configures. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const policy = await getLeavePolicy();
  return NextResponse.json({ policy });
}

const bodySchema = z
  .object({
    paidYearlyAllowance: z.number().int().min(0).max(365),
    paidMonthlyAllowance: z.number().int().min(0).max(31).nullable(),
    unpaidYearlyAllowance: z.number().int().min(0).max(365).nullable(),
    unpaidMonthlyAllowance: z.number().int().min(0).max(31).nullable(),
  })
  // A monthly cap wider than the yearly one could never actually bind, so it's
  // almost certainly a mistake rather than an intentional policy.
  .refine((v) => v.paidMonthlyAllowance === null || v.paidMonthlyAllowance <= v.paidYearlyAllowance, {
    message: "The paid monthly cap can't exceed the yearly allowance",
    path: ["paidMonthlyAllowance"],
  })
  .refine(
    (v) =>
      v.unpaidMonthlyAllowance === null ||
      v.unpaidYearlyAllowance === null ||
      v.unpaidMonthlyAllowance <= v.unpaidYearlyAllowance,
    { message: "The unpaid monthly cap can't exceed the yearly allowance", path: ["unpaidMonthlyAllowance"] }
  );

/** Admin/Super Admin always; a Department Admin needs an explicit LEAVE grant with Update — same gate attendance-settings' PUT already uses for ATTENDANCE. */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || (!isAdmin(user) && !(isDepartmentAdmin(user) && (await canManageModule(user, "LEAVE", "UPDATE"))))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  await db.leavePolicy.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });

  return NextResponse.json({ policy: data });
}
