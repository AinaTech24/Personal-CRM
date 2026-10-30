import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listAllTrashFor } from "@/lib/trash";

/** Everything in Trash the signed-in user can see, across every module that's gotten Trash support so far. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await listAllTrashFor(user);
  return NextResponse.json({ items });
}
