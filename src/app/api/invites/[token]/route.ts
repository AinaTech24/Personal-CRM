import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, createSessionCookie } from "@/lib/auth";
import { emitToAdmins } from "@/lib/socket-emit";
import { addUserToAinaFamily } from "@/lib/chat";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await db.invite.findUnique({ where: { token }, include: { department: true } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite is invalid or has expired" }, { status: 404 });
  }

  return NextResponse.json({
    invite: { email: invite.email, role: invite.role, department: invite.department },
  });
}

const acceptSchema = z.object({
  name: z.string().min(1),
  password: z.string().min(8),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invite is invalid or has expired" }, { status: 404 });
  }

  const parsed = acceptSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const existingUser = await db.user.findUnique({ where: { email: invite.email } });
  if (existingUser) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const { name, password } = parsed.data;
  const passwordHash = await hashPassword(password);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: invite.email,
        name,
        passwordHash,
        role: invite.role,
        departmentId: invite.departmentId,
      },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    if (invite.socialMediaAdmin) {
      await tx.socialMediaMember.create({ data: { userId: created.id, isLead: true } });
    } else if (invite.socialMediaMember) {
      await tx.socialMediaMember.create({ data: { userId: created.id, isLead: false } });
    }
    return created;
  });

  // Every new account joins the auto-managed "Aina Family" group.
  await addUserToAinaFamily(user.id).catch(() => {});

  await createSessionCookie(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    },
    req
  );

  emitToAdmins("user_created", { id: user.id });

  return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
}
