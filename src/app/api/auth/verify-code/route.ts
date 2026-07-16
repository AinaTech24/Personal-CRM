import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSessionCookie } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
  code: z.string().min(4).max(10),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();

  try {
    const user = await db.user.findUnique({ where: { email } });

    // Reject: unknown/blocked user, no code requested, expired code, or wrong code.
    if (!user || !user.isActive || !user.resetCode || !user.resetCodeExpiresAt) {
      return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
    }
    if (user.resetCodeExpiresAt < new Date()) {
      return NextResponse.json({ error: "This code has expired. Request a new one." }, { status: 401 });
    }
    const valid = await verifyPassword(parsed.data.code, user.resetCode);
    if (!valid) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    // Consume the code (single use) and sign the user in.
    await db.user.update({ where: { id: user.id }, data: { resetCode: null, resetCodeExpiresAt: null } });
    await createSessionCookie({
      userId: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    });

    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    console.error("[api/auth/verify-code] failed:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
