import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, hasSocialMediaAccess } from "@/lib/social-media";
import { socialClientListWhere } from "@/lib/social-media-permissions";

const bodySchema = z.object({ ids: z.array(z.string()).min(1).max(500) });

/**
 * Persists a drag-to-reorder from the Clients folder grid. Takes the full
 * ordered id list from the viewer's own visible set and assigns folderOrder
 * = index — simpler and more robust than juggling gaps/fractional
 * positions for a personal-organization feature at this scale. Any id
 * outside what this viewer can actually see is silently ignored rather than
 * rejected, since a regular member's grid only ever contains their own.
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await getSocialMembership(user.id);
  if (!hasSocialMediaAccess(user, membership)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const visible = await db.socialClient.findMany({
    where: { id: { in: parsed.data.ids }, ...socialClientListWhere(user, membership) },
    select: { id: true },
  });
  const visibleIds = new Set(visible.map((c) => c.id));
  const ordered = parsed.data.ids.filter((id) => visibleIds.has(id));

  await db.$transaction(ordered.map((id, index) => db.socialClient.update({ where: { id }, data: { folderOrder: index } })));

  return NextResponse.json({ ok: true });
}
