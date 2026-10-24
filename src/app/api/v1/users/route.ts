import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withActor } from "@/lib/mfd/http";

/** Active app users (name + email only) for Command Centre user pickers. */
export async function GET(req: NextRequest) {
  return withActor(async () => {
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const id = req.nextUrl.searchParams.get("id");
    const users = await db.user.findMany({
      where: {
        isActive: true,
        ...(id ? { id } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { surname: { contains: q } }, { email: { contains: q } }] } : {}),
      },
      select: { id: true, name: true, surname: true, email: true },
      orderBy: { name: "asc" },
      take: 25,
    });
    return NextResponse.json({ items: users.map((u) => ({ id: u.id, label: `${[u.name, u.surname].filter(Boolean).join(" ")} (${u.email})` })) });
  });
}
