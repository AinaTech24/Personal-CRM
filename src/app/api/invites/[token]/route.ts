import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, createSessionCookie } from "@/lib/auth";
import { emitToAdmins } from "@/lib/socket-emit";
import { addUserToAinaFamily } from "@/lib/chat";
import { isValidMobile, isValidPin, normalizeMobile } from "@/lib/credentials";

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
  name: z.string().trim().min(1),
  surname: z.string().trim().min(1),
  mobile: z.string().refine(isValidMobile, "Enter a valid 10-digit mobile number"),
  password: z.string().min(8),
  // Alternate sign-in alongside the password above — mobile + PIN, same as
  // an already-onboarded user can use; set up front rather than left for a
  // separate admin step.
  pin: z.string().refine(isValidPin, "PIN must be exactly 6 digits"),
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

  const { name, surname, password, pin } = parsed.data;
  const mobile = normalizeMobile(parsed.data.mobile);
  const existingMobile = await db.user.findUnique({ where: { mobile }, select: { id: true } });
  if (existingMobile) {
    return NextResponse.json({ error: "That mobile number is already registered to another account" }, { status: 409 });
  }

  const [passwordHash, pinHash] = await Promise.all([hashPassword(password), hashPassword(pin)]);

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: invite.email,
        name,
        surname,
        mobile,
        passwordHash,
        pinHash,
        role: invite.role,
        departmentId: invite.departmentId,
        isDepartmentAdmin: invite.inviteeIsDepartmentAdmin,
      },
    });
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    if (invite.socialMediaAdmin) {
      await tx.socialMediaMember.create({ data: { userId: created.id, isLead: true } });
    } else if (invite.socialMediaMember) {
      await tx.socialMediaMember.create({ data: { userId: created.id, isLead: false } });
    }
    if (invite.crmAdmin) {
      await tx.crmMember.create({ data: { userId: created.id, isLead: true } });
    } else if (invite.crmMember) {
      await tx.crmMember.create({ data: { userId: created.id, isLead: false } });
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
