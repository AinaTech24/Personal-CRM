import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { notifyAndPush } from "@/lib/notify";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { canManageMeeting } from "@/lib/meetings";

const meetingInclude = {
  organizer: { select: { id: true, name: true, email: true } },
  attendees: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" as const } },
};

/**
 * Duplicates a meeting as a new one organized by whoever duplicated it —
 * same title (suffixed), description, location, time, and attendees as the
 * source, but a fresh SCHEDULED status and no reminder carried over. Same
 * access as editing the source meeting.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "MEETINGS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  if (!(await canManageMeeting(user, id, "UPDATE"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await db.meeting.findUnique({ where: { id }, include: { attendees: { select: { id: true } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attendeeIds = existing.attendees.map((a) => a.id);

  const meeting = await db.meeting.create({
    data: {
      title: `${existing.title} (Copy)`,
      description: existing.description,
      location: existing.location,
      startsAt: existing.startsAt,
      endsAt: existing.endsAt,
      status: "SCHEDULED",
      organizerId: user.id,
      attendees: { connect: attendeeIds.map((aid) => ({ id: aid })) },
    },
    include: meetingInclude,
  });

  for (const attendeeId of attendeeIds) {
    if (attendeeId !== user.id) {
      await notifyAndPush(
        attendeeId,
        "meeting_invited",
        { meetingId: meeting.id, meetingTitle: meeting.title, actorName: user.name },
        { title: "Meeting invite", body: `${user.name} invited you to "${meeting.title}"`, url: "/meetings", tag: "meeting-invited" }
      );
    }
  }

  return NextResponse.json({ meeting }, { status: 201 });
}
