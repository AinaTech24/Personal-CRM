import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, isAllowedInviteEmail } from "@/lib/auth";
import { canInviteUsers, isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { sendMail, inviteEmailHtml } from "@/lib/mailer";
import { getAppUrl } from "@/lib/app-settings";
import { getSocialMembership, isSocialMediaLead } from "@/lib/social-media";
import { getCrmMembership, isCrmLead } from "@/lib/crm-team";
import { getUserTeamMembership } from "@/lib/teams";

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
  /** Any other (non-system) team's own "Invite new user" — the team to join, and whether as its lead. */
  teamId: z.string().optional(),
  teamIsLead: z.boolean().optional(),
  /** Grants Department Admin for `departmentId` on acceptance — company Admin only, see the route for why. */
  inviteeIsDepartmentAdmin: z.boolean().optional(),
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, role, departmentId, socialMediaAdmin, socialMediaMember, crmAdmin, crmMember, teamId, teamIsLead } = parsed.data;
  let { inviteeIsDepartmentAdmin } = parsed.data;

  // A company Admin/Super Admin can invite anyone into anything. Four
  // non-admin carve-outs, each only into the inviter's own team/department,
  // each forced to DEPARTMENT_USER — none of them is a side door into "any
  // non-admin can invite anyone":
  // - a Social Media or CRM lead, into their own team;
  // - the lead of any other (non-system) team, into that same team;
  // - a Department Admin, into their own department — but they can't also
  //   grant the new invitee Department Admin; only a company Admin can mint
  //   another one.
  const socialMembership = await getSocialMembership(user.id);
  const crmMembership = await getCrmMembership(user.id);
  const socialLeadInviting = !isAdmin(user) && isSocialMediaLead(user, socialMembership);
  const crmLeadInviting = !isAdmin(user) && !socialLeadInviting && isCrmLead(user, crmMembership);
  const teamMembership =
    !isAdmin(user) && !socialLeadInviting && !crmLeadInviting && teamId ? await getUserTeamMembership(teamId, user.id) : null;
  const customTeamLeadInviting = !!teamMembership?.isLead;
  const deptAdminInviting =
    !isAdmin(user) && !socialLeadInviting && !crmLeadInviting && !customTeamLeadInviting && isDepartmentAdmin(user);
  const leadInviting = socialLeadInviting || crmLeadInviting || customTeamLeadInviting || deptAdminInviting;
  if (!canInviteUsers(user) && !leadInviting) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  } else if (customTeamLeadInviting) {
    if (role !== "DEPARTMENT_USER") {
      return NextResponse.json({ error: "Only a company Admin can invite as Admin or Super Admin" }, { status: 403 });
    }
    if (departmentId) {
      return NextResponse.json({ error: "A team lead can only invite into their own team" }, { status: 400 });
    }
  } else if (deptAdminInviting) {
    if (role !== "DEPARTMENT_USER") {
      return NextResponse.json({ error: "Only a company Admin can invite as Admin or Super Admin" }, { status: 403 });
    }
    if (departmentId !== user.departmentId) {
      return NextResponse.json({ error: "A Department Admin can only invite into their own department" }, { status: 400 });
    }
    // Scoped to exactly one thing — a plain member of their own department.
    // Not a lead-equivalent grant into any other module.
    inviteeIsDepartmentAdmin = false;
  }

  // A non-admin can only ever grant membership on a team whose lead they
  // actually are (teamMembership, looked up above, already proves that) —
  // a company Admin may target any team id directly, system ones included,
  // though the console UI only ever offers this for a non-system team.
  if (teamId && !isAdmin(user) && !customTeamLeadInviting) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only a company Admin may grant Social Media / CRM / another team's
  // access through a Department Admin's invite — those modules are
  // unrelated to a department.
  const grantSocialMediaAdmin = deptAdminInviting ? false : socialMediaAdmin;
  const grantSocialMediaMember = deptAdminInviting ? false : socialMediaMember;
  const grantCrmAdmin = deptAdminInviting ? false : crmAdmin;
  const grantCrmMember = deptAdminInviting ? false : crmMember;
  const grantTeamId = deptAdminInviting ? null : (teamId ?? null);
  const grantTeamIsLead = deptAdminInviting ? false : !!teamIsLead;

  // Social Media/CRM already provision membership through their own
  // dedicated flags above — this generic path is for every other team, so a
  // system team id here (accidental or not) would double up on that.
  if (grantTeamId) {
    const targetTeam = await db.team.findUnique({ where: { id: grantTeamId }, select: { isSystem: true } });
    if (!targetTeam) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    if (targetTeam.isSystem) {
      return NextResponse.json({ error: "Use that team's own invite option instead" }, { status: 400 });
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
      socialMediaAdmin: grantSocialMediaAdmin ?? false,
      socialMediaMember: grantSocialMediaMember ?? false,
      crmAdmin: grantCrmAdmin ?? false,
      crmMember: grantCrmMember ?? false,
      teamId: grantTeamId,
      teamIsLead: grantTeamIsLead,
      inviteeIsDepartmentAdmin: inviteeIsDepartmentAdmin ?? false,
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
