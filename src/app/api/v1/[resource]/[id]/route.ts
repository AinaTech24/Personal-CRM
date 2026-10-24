import { NextRequest, NextResponse } from "next/server";
import { deleteLink, getRecord, updateRecord } from "@/lib/mfd/engine";
import { jsonBody, tableOf, withActor } from "@/lib/mfd/http";

type Ctx = { params: Promise<{ resource: string; id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  return withActor(async (actor) => {
    const { resource, id } = await params;
    return NextResponse.json(await getRecord(actor, tableOf(resource), id), { headers: { "Cache-Control": "no-store" } });
  });
}

/** Partial update; the body must carry the row_version it was read at (GV-03). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  return withActor(async (actor) => {
    const { resource, id } = await params;
    return NextResponse.json(await updateRecord(actor, tableOf(resource), id, await jsonBody(req)));
  });
}

/** Only pure link rows can be removed; everything else is archived (POST …/archive). */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  return withActor(async (actor) => {
    const { resource, id } = await params;
    await deleteLink(actor, tableOf(resource), id);
    return NextResponse.json({ ok: true });
  });
}
