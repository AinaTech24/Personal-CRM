import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { createTeam, listTeams, listTeamsForUser } from "@/lib/teams";

/** Every team for an Admin; only the teams this user belongs to otherwise. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teams = isAdmin(user) ? await listTeams() : await listTeamsForUser(user.id);
  return NextResponse.json({ teams });
}

const bodySchema = z.object({ name: z.string().trim().min(1).max(80) });

/** A brand-new custom team (Social Media/CRM are seeded once, not created this way). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A name is required" }, { status: 400 });

  try {
    const team = await createTeam(parsed.data.name);
    return NextResponse.json({ team }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Something went wrong" }, { status: 409 });
  }
}
