import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { clientBodySchema, clientData, clientInclude, dedupeTeam, serializeClient } from "@/lib/clients";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.client.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = clientBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;
  const team = dedupeTeam(body.team);

  const known = await db.user.count({ where: { id: { in: team.map((m) => m.userId) } } });
  if (known !== team.length) return NextResponse.json({ error: "A team member no longer exists." }, { status: 400 });

  // The team is replaced wholesale, in one transaction, so a half-saved edit can't leave a client with no team.
  const client = await db.$transaction(async (tx) => {
    await tx.clientTeamMember.deleteMany({ where: { clientId: id } });
    return tx.client.update({
      where: { id },
      data: { ...clientData(body), team: { create: team } },
      include: clientInclude,
    });
  });
  return NextResponse.json({ client: serializeClient(client) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await db.client.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
