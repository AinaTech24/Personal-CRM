import { NextResponse } from "next/server";
import { codesFor } from "@/lib/mfd/access";
import { TABLES } from "@/lib/mfd/catalog";
import { withActor } from "@/lib/mfd/http";

/** The caller's Command Centre identity and CRUAPE codes per table, for the UI. */
export async function GET() {
  return withActor(async (actor) => {
    const permissions: Record<string, string> = {};
    for (const t of Object.keys(TABLES)) permissions[t] = codesFor(actor, t);
    return NextResponse.json({
      user_id: actor.userId,
      name: actor.name,
      roles: [...actor.roles],
      member_id: actor.memberId,
      granted_mfd_count: actor.grantedOrgIds.size,
      permissions,
    });
  });
}
