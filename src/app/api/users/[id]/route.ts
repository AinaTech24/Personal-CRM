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
  if (!user || !canManageUsers(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

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
    },
    include: { department: true },
    omit: { passwordHash: true, resetCode: true, resetCodeExpiresAt: true, pinHash: true, pinResetCode: true, pinResetCodeExpiresAt: true },
  });

  emitToAdmins("user_updated", { id: updated.id });
  return NextResponse.json({ user: updated });
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
