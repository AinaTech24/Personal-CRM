import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { canManageModule } from "@/lib/module-permissions-store";
import { combinedTeamScopeFor } from "@/lib/team-scope";
import { notifyAndPush } from "@/lib/notify";

/**
 * An on-demand nudge to the organizer and every attendee — separate from the
 * scheduled remindAt-based send-reminders cron, for whoever can already
 * manage this meeting (the organizer, an admin, a Meetings module grant, or
 * a Social Media/CRM lead covering it) to ping everyone right now.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const meeting = await db.meeting.findUnique({
    where: { id },
    select: { id: true, title: true, organizerId: true, attendees: { select: { id: true } } },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let allowed = isAdmin(user) || meeting.organizerId === user.id || (await canManageModule(user, "MEETINGS"));
  if (!allowed) {
    const teamUserIds = await combinedTeamScopeFor(user);
    allowed = !!teamUserIds && (teamUserIds.includes(meeting.organizerId) || meeting.attendees.some((a) => teamUserIds.includes(a.id)));
  }
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const recipientIds = Array.from(new Set([meeting.organizerId, ...meeting.attendees.map((a) => a.id)])).filter(
    (recipientId) => recipientId !== user.id
  );

  await Promise.all(
    recipientIds.map((recipientId) =>
      notifyAndPush(
        recipientId,
        "meeting_reminder",
        { meetingId: meeting.id, meetingTitle: meeting.title, actorName: user.name },
        { title: "Meeting reminder", body: `${user.name} sent a reminder about "${meeting.title}"`, url: "/meetings", tag: "meeting-reminder" }
      )
    )
  );

  return NextResponse.json({ ok: true, notified: recipientIds.length });
}
