import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers, isSuperAdmin } from "@/lib/permissions";
import { emitToAdmins } from "@/lib/socket-emit";

const patchSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "DEPARTMENT_USER"]).optional(),
  departmentId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  /** "YYYY-MM-DD", or null to clear. */
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && d.getTime() <= Date.now();
    })
    .nullable()
    .optional(),
  /** Social Media team membership — not a real company Role, a separate
   *  SocialMediaMember row. "NONE" removes membership entirely. */
  socialMediaRole: z.enum(["NONE", "MEMBER", "ADMIN"]).optional(),
  /** Admin of their own department — see src/lib/permissions.ts. Admin-only to set; module grants themselves are edited separately, in the Permission Manager (/admin/permissions). */
  isDepartmentAdmin: z.boolean().optional(),
});

/** Blocks the last remaining active Super Admin from being demoted, blocked, or deleted. */
async function wouldRemoveLastSuperAdmin(targetId: string) {
  const activeSuperAdmins = await db.user.count({
    where: { role: "SUPER_ADMIN", isActive: true, NOT: { id: targetId } },
  });
  return activeSuperAdmins === 0;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  // Editing anyone's birthday — including a Birthdays-module grant holder's —
  // is admin-only. A grant still lets a non-admin manage gifts and view the
  // roster; it no longer lets them overwrite a birth date (see
  // src/app/api/profile/route.ts for the matching self-service rule).
  if (!canManageUsers(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only Super Admins may create/modify Super Admin or Admin roles.
  if (data.role !== undefined && !isSuperAdmin(user) && (data.role === "SUPER_ADMIN" || target.role === "SUPER_ADMIN")) {
    return NextResponse.json({ error: "Only a Super Admin can change Super Admin roles" }, { status: 403 });
  }

  // Guard against locking yourself out or removing the last Super Admin.
  if (target.id === user.id && data.isActive === false) {
    return NextResponse.json({ error: "You cannot block your own account" }, { status: 400 });
  }
  const demoting = data.role !== undefined && data.role !== "SUPER_ADMIN" && target.role === "SUPER_ADMIN";
  const blocking = data.isActive === false && target.isActive;
  if ((demoting || blocking) && target.role === "SUPER_ADMIN" && (await wouldRemoveLastSuperAdmin(target.id))) {
    return NextResponse.json({ error: "At least one active Super Admin is required" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id },
    data: {
      ...(data.role !== undefined && { role: data.role }),
      ...(data.departmentId !== undefined && { departmentId: data.departmentId || null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.birthday !== undefined && { birthday: data.birthday ? new Date(`${data.birthday}T00:00:00.000Z`) : null }),
      ...(data.isDepartmentAdmin !== undefined && { isDepartmentAdmin: data.isDepartmentAdmin }),
    },
    include: {
      department: true,
      socialMediaMembership: { select: { isLead: true } },
    },
    omit: { passwordHash: true, resetCode: true, resetCodeExpiresAt: true, pinHash: true, pinResetCode: true, pinResetCodeExpiresAt: true },
  });

  if (data.socialMediaRole === "NONE") {
    await db.socialMediaMember.deleteMany({ where: { userId: id } });
  } else if (data.socialMediaRole === "MEMBER" || data.socialMediaRole === "ADMIN") {
    await db.socialMediaMember.upsert({
      where: { userId: id },
      create: { userId: id, isLead: data.socialMediaRole === "ADMIN" },
      update: { isLead: data.socialMediaRole === "ADMIN" },
    });
  }

  // Re-read so the response reflects the membership change made just above —
  // the `updated` object was fetched before it.
  const withExtras =
    data.socialMediaRole !== undefined
      ? { ...updated, socialMediaMembership: await db.socialMediaMember.findUnique({ where: { userId: id }, select: { isLead: true } }) }
      : updated;

  emitToAdmins("user_updated", { id: updated.id });
  return NextResponse.json({ user: withExtras });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canManageUsers(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (target.id === user.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }
  if (target.role === "SUPER_ADMIN" && !isSuperAdmin(user)) {
    return NextResponse.json({ error: "Only a Super Admin can delete a Super Admin" }, { status: 403 });
  }
  if (target.role === "SUPER_ADMIN" && (await wouldRemoveLastSuperAdmin(target.id))) {
    return NextResponse.json({ error: "At least one active Super Admin is required" }, { status: 400 });
  }

  try {
    await db.user.delete({ where: { id } });
  } catch {
    return NextResponse.json(
      { error: "This user owns records (leads, tasks, etc.). Block them instead of deleting." },
      { status: 409 }
    );
  }
  emitToAdmins("user_deleted", { id });
  return NextResponse.json({ ok: true });
}
