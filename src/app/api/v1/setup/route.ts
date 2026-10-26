import { NextResponse } from "next/server";
import { isAdminActor } from "@/lib/mfd/access";
import { withActor } from "@/lib/mfd/http";
import { installStarterContent } from "@/lib/mfd/starter";

/** Installs the kit's scoring scheme and diagnostic template (idempotent; admins only). */
export async function POST() {
  return withActor(async (actor) => {
    if (!isAdminActor(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json(await installStarterContent(actor));
  });
}
