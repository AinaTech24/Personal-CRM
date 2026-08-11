import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser } from "@/lib/social-media";

/** Every distinct year/month that has at least one Content Calendar slot for this client — the Content Reports tab's month list. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId is required" }, { status: 400 });

  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, clientId);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await db.socialContentCalendarSlot.groupBy({
    by: ["year", "month"],
    where: { clientId },
    _count: { _all: true },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const months = rows.map((r) => ({ year: r.year, month: r.month, count: r._count._all }));
  return NextResponse.json({ months });
}
