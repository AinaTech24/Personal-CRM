import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManagePermissionsFor, isAdmin } from "@/lib/permissions";
import { getUserModuleMatrix, setUserModuleMatrix } from "@/lib/module-permissions-store";
import { MANAGED_MODULES, type ManagedModule, type ModulePermissionFlags } from "@/lib/module-permissions";
import { sharesLedTeamWith } from "@/lib/teams";

/**
 * One user's module-permission matrix — the Permission Manager's data for a
 * single person. Open to a company Admin for anyone, a Department Admin for
 * someone sharing their own department, or a team lead for someone sharing
 * one of their (non-disabled) teams — never for themselves (see
 * canManagePermissionsFor and sharesLedTeamWith).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, surname: true, email: true, departmentId: true, department: { select: { name: true } } },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManagePermissionsFor(actor, target) && !(await sharesLedTeamWith(actor.id, target.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const matrix = await getUserModuleMatrix(userId);
  return NextResponse.json({ user: target, matrix });
}

const flagsSchema = z.object({
  canCreate: z.boolean(),
  canRead: z.boolean(),
  canUpdate: z.boolean(),
  canDelete: z.boolean(),
  blocked: z.boolean(),
  allDepartments: z.boolean(),
});

const bodySchema = z.object({
  matrix: z.object(Object.fromEntries(MANAGED_MODULES.map((m) => [m, flagsSchema])) as Record<(typeof MANAGED_MODULES)[number], typeof flagsSchema>),
});

/** Full replacement of one user's module-permission matrix. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, departmentId: true } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManagePermissionsFor(actor, target) && !(await sharesLedTeamWith(actor.id, target.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  let matrix = parsed.data.matrix as Record<ManagedModule, ModulePermissionFlags>;
  if (!isAdmin(actor)) {
    // Only a company Admin may grant company-wide (all-department) scope —
    // a Department Admin or team lead could otherwise hand one of their
    // people more reach than they themselves have. Keep whatever each
    // module's allDepartments already was; silently ignore anything else a
    // non-admin actor sent for it.
    const current = await getUserModuleMatrix(userId);
    matrix = Object.fromEntries(
      MANAGED_MODULES.map((m) => [m, { ...matrix[m], allDepartments: current[m].allDepartments }])
    ) as Record<ManagedModule, ModulePermissionFlags>;
  }

  await setUserModuleMatrix(userId, matrix);
  const updated = await getUserModuleMatrix(userId);
  return NextResponse.json({ matrix: updated });
}
