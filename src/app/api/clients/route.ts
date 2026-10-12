import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { clientBodySchema, clientData, clientInclude, dedupeTeam, serializeClient } from "@/lib/clients";

/** Client accounts are an admin-only record: owner contact details and contract dates aren't for the wider team. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clients = await db.client.findMany({ include: clientInclude, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ clients: clients.map(serializeClient) });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = clientBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const body = parsed.data;
  const team = dedupeTeam(body.team);

  const known = await db.user.count({ where: { id: { in: team.map((m) => m.userId) } } });
  if (known !== team.length) return NextResponse.json({ error: "A team member no longer exists." }, { status: 400 });

  const client = await db.client.create({
    data: { ...clientData(body), createdById: user.id, team: { create: team } },
    include: clientInclude,
  });
  return NextResponse.json({ client: serializeClient(client) }, { status: 201 });
}
