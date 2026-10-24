import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { assertFileAccess } from "@/lib/mfd/actions";
import { HttpError, writeAudit } from "@/lib/mfd/engine";
import { withActor } from "@/lib/mfd/http";
import { downloadToken, getBlob, verifyDownloadToken } from "@/lib/mfd/storage";

const INLINE_SAFE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "audio/mpeg", "audio/wav", "audio/mp4", "video/mp4", "video/webm"]);

/**
 * AT-05: GET /api/v1/files/{id} returns a short-lived download link bound
 * to the caller; GET with ?token= streams the bytes. Both re-check that the
 * caller can reach the file through a record they're allowed to read.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withActor(async (actor) => {
    const { id } = await params;
    const file = await assertFileAccess(actor, id);
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ url: `/api/v1/files/${id}?token=${encodeURIComponent(downloadToken(id, actor.userId))}`, expires_in: 120 }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!verifyDownloadToken(token, id, actor.userId)) throw new HttpError(403, "This download link has expired.");
    const bytes = await getBlob(file.storage_key as string);
    if (!bytes) throw new HttpError(404, "Not found");
    await db.$transaction((tx) => writeAudit(tx, actor, "file_objects", id, "download", null, null));
    const mime = file.mime_type as string;
    const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE_SAFE.has(mime);
    const name = encodeURIComponent(file.original_filename as string);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${name}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
