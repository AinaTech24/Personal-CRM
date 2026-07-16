import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";

const MAX_AVATAR = 1_500_000;

const bodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  surname: z.string().max(120).nullable().optional(),
  mobile: z.string().max(40).nullable().optional(),
  avatarDataUrl: z
    .string()
    .max(MAX_AVATAR)
    .regex(/^data:image\//, "Must be an image data URL")
    .nullable()
    .optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  // Password change requires the current password.
  let passwordHash: string | undefined;
  if (data.newPassword) {
    if (!data.currentPassword) {
      return NextResponse.json({ error: "Enter your current password to set a new one" }, { status: 400 });
    }
    const ok = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    passwordHash = await hashPassword(data.newPassword);
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.surname !== undefined && { surname: data.surname || null }),
      ...(data.mobile !== undefined && { mobile: data.mobile || null }),
      ...(data.avatarDataUrl !== undefined && { avatarDataUrl: data.avatarDataUrl }),
      ...(passwordHash && { passwordHash }),
    },
    select: { id: true, name: true, surname: true, mobile: true, avatarDataUrl: true, email: true },
  });

  return NextResponse.json({ user: updated });
}
