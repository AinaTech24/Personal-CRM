import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * How many unread messages this user has, in total and per conversation.
 *
 * Drives the badge on the sidebar's Messages item. Unlike the conversation
 * list — which only needs a "has something new" dot — this counts the actual
 * messages, so the badge can say 3 rather than 1.
 *
 * A message counts when it is newer than the member's lastReadAt, was sent by
 * somebody else, and hasn't been deleted for this user.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await db.conversationMember.findMany({
    where: { userId: user.id },
    select: { conversationId: true, lastReadAt: true },
  });
  if (memberships.length === 0) return NextResponse.json({ total: 0, byConversation: {} });

  // One grouped query rather than one per conversation. `lastReadAt` differs per
  // membership, so the OR spells out each conversation's own cutoff.
  const grouped = await db.message.groupBy({
    by: ["conversationId"],
    where: {
      senderId: { not: user.id },
      hiddenFor: { none: { userId: user.id } },
      OR: memberships.map((m) => ({
        conversationId: m.conversationId,
        ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
      })),
    },
    _count: { _all: true },
  });

  const byConversation: Record<string, number> = {};
  let total = 0;
  for (const row of grouped) {
    const n = row._count._all;
    if (n > 0) {
      byConversation[row.conversationId] = n;
      total += n;
    }
  }

  return NextResponse.json({ total, byConversation });
}
