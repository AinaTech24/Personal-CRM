import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";

// 30 / minute per IP per form — generous for a real visitor loading the
// page (and the odd reload), tight enough that a script hammering this
// endpoint can't meaningfully inflate the view count.
const LIMIT = 30;
const WINDOW_MS = 60 * 1000;

/** Public — fired once per page load at /f/[slug] to count it toward the form's analytics. Best-effort: a missed or double-counted view never blocks anything. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = requestDevice(req).ip ?? "unknown";
  const { allowed } = rateLimit(`form-view:${slug}:${ip}`, LIMIT, WINDOW_MS);
  if (!allowed) return NextResponse.json({ ok: true });

  await db.form.updateMany({ where: { slug }, data: { viewCount: { increment: 1 } } });
  return NextResponse.json({ ok: true });
}
