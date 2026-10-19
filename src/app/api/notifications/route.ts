import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DEFAULT_TAKE = 30;
const MAX_TAKE = 200;

/**
 * The bell calls this with no params (its original 30-item default
 * preserved). The full notifications page passes `take`/`skip` for its
 * "Load more" pagination and `unreadOnly=1` for the Unread tab — narrowing
 * server-side there rather than just client-side filtering keeps that tab
 * correct even past whatever page the client has fetched so far.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const take = Math.min(Math.max(Number(params.get("take")) || DEFAULT_TAKE, 1), MAX_TAKE);
  const skip = Math.max(Number(params.get("skip")) || 0, 0);
  const unreadOnly = params.get("unreadOnly") === "1";

  const [notifications, total, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    db.notification.count({ where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return NextResponse.json({ notifications, total, unreadCount, hasMore: skip + notifications.length < total });
}

/** `{}` marks everything read; `{id}` marks one read (or unread with `read: false`). */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : undefined;
  const read = typeof body.read === "boolean" ? body.read : true;

  if (id) {
    await db.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: read ? new Date() : null },
    });
  } else {
    await db.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true });
}

/** `?id=` dismisses one notification; no query (the bell's "Clear all") deletes every one of the current user's. */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  await db.notification.deleteMany({ where: { userId: user.id, ...(id ? { id } : {}) } });
  return NextResponse.json({ ok: true });
}
