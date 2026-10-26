import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { MODULE_KEYS } from "@/lib/modules";
import { getBlockedModules } from "@/lib/module-permissions-store";

const ID = "default";

function readHidden(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && MODULE_KEYS.includes(v)) : [];
}

/**
 * Any signed-in user can read which modules are hidden (the sidebar needs
 * it) — alongside the company-wide hide list, this also returns the
 * CALLER'S OWN per-person blocked modules (see
 * module-permissions-store.ts's getBlockedModules), never anyone else's.
 * An admin can't be blocked, so this skips the lookup for them entirely.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [s, blockedModules] = await Promise.all([
    db.appSettings.findUnique({ where: { id: ID }, select: { hiddenModules: true } }),
    isAdmin(user) ? Promise.resolve([]) : getBlockedModules(user.id),
  ]);
  return NextResponse.json({ hiddenModules: readHidden(s?.hiddenModules), blockedModules, isAdmin: isAdmin(user) });
}

const putSchema = z.object({ hiddenModules: z.array(z.enum(MODULE_KEYS as [string, ...string[]])) });

/** Only admins/super admins can change which modules users see. */
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const hiddenModules = [...new Set(parsed.data.hiddenModules)];

  const s = await db.appSettings.upsert({
    where: { id: ID },
    create: { id: ID, hiddenModules },
    update: { hiddenModules },
  });
  return NextResponse.json({ hiddenModules: readHidden(s.hiddenModules) });
}
