import { NextRequest, NextResponse } from "next/server";
import { createRecord, exportCsv, listRecords, lookupRecords, parseListParams } from "@/lib/mfd/engine";
import { jsonBody, tableOf, withActor } from "@/lib/mfd/http";

/**
 * GET  /api/v1/{resource}            list (filters by column, q, archived, sort, dir, limit, offset)
 * GET  /api/v1/{resource}?lookup=1   id + label pairs for reference pickers
 * GET  /api/v1/{resource}?format=csv export (needs the E permission; audited)
 * POST /api/v1/{resource}            create
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  return withActor(async (actor) => {
    const table = tableOf((await params).resource);
    const sp = req.nextUrl.searchParams;
    if (sp.get("lookup")) {
      const p = parseListParams(table, sp);
      return NextResponse.json({ items: await lookupRecords(actor, table, p.q, p.filters) });
    }
    if (sp.get("format") === "csv") {
      const csv = await exportCsv(actor, table, { ...parseListParams(table, sp), limit: 5000, offset: 0 });
      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${table}-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    const result = await listRecords(actor, table, parseListParams(table, sp));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  return withActor(async (actor) => {
    const table = tableOf((await params).resource);
    const rec = await createRecord(actor, table, await jsonBody(req));
    return NextResponse.json(rec, { status: 201 });
  });
}
