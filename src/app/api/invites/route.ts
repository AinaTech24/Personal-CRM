import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, isAinatechEmail } from "@/lib/auth";
import { canInviteUsers } from "@/lib/permissions";
import { sendMail, inviteEmailHtml } from "@/lib/mailer";
import { getAppUrl } from "@/lib/app-settings";

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "DEPARTMENT_USER"]),
  departmentId: z.string().optional().nullable(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canInviteUsers(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await db.invite.findMany({
    where: { acceptedAt: null },
    include: { department: true, invitedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invites });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canInviteUsers(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, role, departmentId } = parsed.data;

  if (!isAinatechEmail(email)) {
    return NextResponse.json(
      { error: "Only @ainatech.in email addresses can be invited" },
      { status: 400 }
    );
  }

  if (role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only a Super Admin can invite another Super Admin" },
      { status: 403 }
    );
  }

  const existingUser = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existingUser) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invite = await db.invite.create({
    data: {
      email: email.toLowerCase(),
      role,
      departmentId: departmentId || null,
      token,
      invitedById: user.id,
      expiresAt,
    },
  });

  // Falling back to the request's own origin keeps invites usable when nothing is
  // configured. Previously an unset APP_URL silently produced "undefined/invite/...",
  // which sends fine and is dead on arrival.
  const baseUrl = (await getAppUrl()) ?? req.nextUrl.origin;
  const acceptUrl = `${baseUrl}/invite/${token}`;
  await sendMail({
    to: email,
    subject: "You're invited to Aina CRM",
    html: inviteEmailHtml({ inviterName: user.name, acceptUrl }),
  });

  return NextResponse.json({ invite: { id: invite.id, email: invite.email } }, { status: 201 });
}
