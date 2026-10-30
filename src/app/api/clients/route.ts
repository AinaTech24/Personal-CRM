import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { CLIENT_CATEGORIES, clientBodySchema, clientData, clientInclude, dedupeTeam, serializeClient } from "@/lib/clients";
import { parsePageParams } from "@/lib/pagination";

/**
 * Client accounts are an admin-only record: owner contact details and
 * contract dates aren't for the wider team. The category tabs' counts are
 * always company-wide (a separate, unfiltered `groupBy`), regardless of the
 * current category/search filter or how much has been paginated in, so a
 * tab never understates how many clients are really in it.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const and: object[] = [{ deletedAt: null }];

  const category = params.get("category");
  if (category && (CLIENT_CATEGORIES as readonly string[]).includes(category)) {
    and.push({ category });
  }
  const q = params.get("q")?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { ownerName: { contains: q } },
        { mobile: { contains: q } },
        { email: { contains: q } },
        { reason: { contains: q } },
        { team: { some: { user: { OR: [{ name: { contains: q } }, { surname: { contains: q } }] } } } },
      ],
    });
  }

  const where = and.length > 0 ? { AND: and } : {};
  const { take, skip } = parsePageParams(params, { defaultTake: 50, maxTake: 200 });

  const [rows, total, categoryGroups] = await Promise.all([
    db.client.findMany({ where, include: clientInclude, orderBy: { createdAt: "desc" }, take, skip }),
    db.client.count({ where }),
    db.client.groupBy({ by: ["category"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = { ALL: 0 };
  for (const g of categoryGroups) {
    counts[g.category] = g._count._all;
    counts.ALL += g._count._all;
  }

  return NextResponse.json({ clients: rows.map(serializeClient), total, hasMore: skip + rows.length < total, counts });
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
