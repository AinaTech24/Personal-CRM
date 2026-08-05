import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, isAllowedInviteEmail } from "@/lib/auth";
import { canInviteUsers, isAdmin } from "@/lib/permissions";
import { sendMail, inviteEmailHtml } from "@/lib/mailer";
import { getAppUrl } from "@/lib/app-settings";
import { getSocialMembership, isSocialMediaLead } from "@/lib/social-media";

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "DEPARTMENT_USER"]),
  departmentId: z.string().optional().nullable(),
  /** "Social Media (Admin)" from the invite picker — the account is still created as DEPARTMENT_USER. */
  socialMediaAdmin: z.boolean().optional(),
  /** "Social Media User" from the invite picker — a regular (non-lead) team member. */
  socialMediaMember: z.boolean().optional(),
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A company Admin/Super Admin can invite anyone into anything.
  // A Social Media lead who ISN'T also a company admin can additionally
  // invite — but only into their own team: a plain DEPARTMENT_USER, no
  // department of their own, and it must actually add them to the team
  // (as a regular member or as a lead) — otherwise this would just be a
  // side door into "any non-admin can invite anyone."
  const membership = await getSocialMembership(user.id);
  const leadInviting = !isAdmin(user) && isSocialMediaLead(user, membership);
  if (!canInviteUsers(user) && !leadInviting) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, role, departmentId, socialMediaAdmin, socialMediaMember } = parsed.data;

  if (leadInviting) {
    if (role !== "DEPARTMENT_USER") {
      return NextResponse.json({ error: "Only a company Admin can invite as Admin or Super Admin" }, { status: 403 });
    }
    if (departmentId) {
      return NextResponse.json({ error: "A Social Media lead can only invite into the Social Media team" }, { status: 400 });
    }
    if (!socialMediaAdmin && !socialMediaMember) {
      return NextResponse.json({ error: "Choose Social Media User or Social Media (Admin)" }, { status: 400 });
    }
  }

  const smtp = await db.smtpSettings.findUnique({ where: { id: "default" }, select: { allowExternalInvites: true } });
  if (!isAllowedInviteEmail(email, smtp?.allowExternalInvites ?? false)) {
    return NextResponse.json(
      {
        error: smtp?.allowExternalInvites
          ? "Only @ainatech.in or Gmail / Outlook / iCloud / Yahoo addresses can be invited"
          : "Only @ainatech.in email addresses can be invited",
      },
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
      socialMediaAdmin: socialMediaAdmin ?? false,
      socialMediaMember: socialMediaMember ?? false,
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
