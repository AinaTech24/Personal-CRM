import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { trashProviderFor } from "@/lib/trash";

/** Restores a trashed record exactly as it was — nothing about it was ever touched while in Trash. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ module: string; id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { module, id } = await params;
  const provider = trashProviderFor(module);
  if (!provider) return NextResponse.json({ error: "Unknown module" }, { status: 400 });

  const result = await provider.restore(user, id);
  if (result === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ ok: true });
}
