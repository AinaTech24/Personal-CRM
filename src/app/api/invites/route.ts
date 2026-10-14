import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, isAllowedInviteEmail } from "@/lib/auth";
import { canInviteUsers, isAdmin } from "@/lib/permissions";
import { sendMail, inviteEmailHtml } from "@/lib/mailer";
import { getAppUrl } from "@/lib/app-settings";
import { getSocialMembership, isSocialMediaLead } from "@/lib/social-media";
import { getCrmMembership, isCrmLead } from "@/lib/crm-team";

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "DEPARTMENT_USER"]),
  departmentId: z.string().optional().nullable(),
  /** "Social Media (Admin)" from the invite picker — the account is still created as DEPARTMENT_USER. */
  socialMediaAdmin: z.boolean().optional(),
  /** "Social Media User" from the invite picker — a regular (non-lead) team member. */
  socialMediaMember: z.boolean().optional(),
  /** Same idea as socialMediaAdmin/socialMediaMember, for the CRM Team's own invite picker. */
  crmAdmin: z.boolean().optional(),
  crmMember: z.boolean().optional(),
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
  // A Social Media or CRM lead who ISN'T also a company admin can
  // additionally invite — but only into their own team: a plain
  // DEPARTMENT_USER, no department of their own, and it must actually add
  // them to that team (as a regular member or as a lead) — otherwise this
  // would just be a side door into "any non-admin can invite anyone."
  const socialMembership = await getSocialMembership(user.id);
  const crmMembership = await getCrmMembership(user.id);
  const socialLeadInviting = !isAdmin(user) && isSocialMediaLead(user, socialMembership);
  const crmLeadInviting = !isAdmin(user) && !socialLeadInviting && isCrmLead(user, crmMembership);
  const leadInviting = socialLeadInviting || crmLeadInviting;
  if (!canInviteUsers(user) && !leadInviting) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, role, departmentId, socialMediaAdmin, socialMediaMember, crmAdmin, crmMember } = parsed.data;

  if (socialLeadInviting) {
    if (role !== "DEPARTMENT_USER") {
      return NextResponse.json({ error: "Only a company Admin can invite as Admin or Super Admin" }, { status: 403 });
    }
    if (departmentId) {
      return NextResponse.json({ error: "A Social Media lead can only invite into the Social Media team" }, { status: 400 });
    }
    if (!socialMediaAdmin && !socialMediaMember) {
      return NextResponse.json({ error: "Choose Social Media User or Social Media (Admin)" }, { status: 400 });
    }
  } else if (crmLeadInviting) {
    if (role !== "DEPARTMENT_USER") {
      return NextResponse.json({ error: "Only a company Admin can invite as Admin or Super Admin" }, { status: 403 });
    }
    if (departmentId) {
      return NextResponse.json({ error: "A CRM lead can only invite into the CRM team" }, { status: 400 });
    }
    if (!crmAdmin && !crmMember) {
      return NextResponse.json({ error: "Choose CRM User or CRM (Admin)" }, { status: 400 });
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
      crmAdmin: crmAdmin ?? false,
      crmMember: crmMember ?? false,
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

  // The invite row above is already committed — a mail-server hiccup (bad
  // credentials, a blocked port, a timeout) shouldn't make a perfectly valid,
  // already-created invite look like it failed outright. Report the send
  // failure instead of throwing, so the admin can still copy and share the
  // link by hand rather than seeing an opaque 500 for work that mostly worked.
  let emailSent = true;
  try {
    await sendMail({
      to: email,
      subject: "You're invited to Aina CRM",
      html: inviteEmailHtml({ inviterName: user.name, acceptUrl }),
    });
  } catch (err) {
    console.error("[invites] Failed to send invite email", err);
    emailSent = false;
  }

  return NextResponse.json({ invite: { id: invite.id, email: invite.email }, emailSent, acceptUrl }, { status: 201 });
}
