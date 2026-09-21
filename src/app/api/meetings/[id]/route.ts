import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isAnalyst, type PermissionUser } from "@/lib/permissions";
import { notifyAndPush } from "@/lib/notify";
import { socialMediaTeamScopeFor } from "@/lib/social-media";

const meetingInclude = {
  organizer: { select: { id: true, name: true, email: true } },
  attendees: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" as const } },
};

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().nullable().optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional(),
  attendeeIds: z.array(z.string()).optional(),
  remindAt: z.string().nullable().optional(),
});

/**
 * Only the organizer, an admin, or a Social Media lead managing a meeting
 * organized by (or attended by) someone on their team may change or remove
 * a meeting.
 */
async function canManage(user: PermissionUser, meetingId: string) {
  if (isAdmin(user)) return true;
  const m = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { organizerId: true, attendees: { select: { id: true } } },
  });
  if (!m) return false;
  if (m.organizerId === user.id) return true;

  const teamUserIds = await socialMediaTeamScopeFor(user);
  if (!teamUserIds) return false;
  return teamUserIds.includes(m.organizerId) || m.attendees.some((a) => teamUserIds.includes(a.id));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const meeting = await db.meeting.findUnique({ where: { id }, include: meetingInclude });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let visible =
    isAdmin(user) || isAnalyst(user) || meeting.organizer.id === user.id || meeting.attendees.some((a) => a.id === user.id);
  if (!visible) {
    const teamUserIds = await socialMediaTeamScopeFor(user);
    visible =
      !!teamUserIds &&
      (teamUserIds.includes(meeting.organizer.id) || meeting.attendees.some((a) => teamUserIds.includes(a.id)));
  }
  if (!visible) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ meeting });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await canManage(user, id))) {
    return NextResponse.json({ error: "Only the organizer can edit this meeting" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  // Read the attendee list before the update so newly-added attendees can be
  // told apart from ones already on the meeting — an edit that doesn't touch
  // the guest list shouldn't re-notify everyone already invited.
  let previousAttendeeIds: string[] | null = null;
  if (d.attendeeIds !== undefined) {
    const existing = await db.meeting.findUnique({ where: { id }, select: { attendees: { select: { id: true } } } });
    previousAttendeeIds = existing?.attendees.map((a) => a.id) ?? [];
  }

  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = d.title;
  if (d.description !== undefined) data.description = d.description || null;
  if (d.location !== undefined) data.location = d.location || null;
  if (d.status !== undefined) data.status = d.status;
  if (d.startsAt !== undefined) {
    const s = new Date(d.startsAt);
    if (Number.isNaN(s.getTime())) return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
    data.startsAt = s;
  }
  if (d.endsAt !== undefined) {
    data.endsAt = d.endsAt ? new Date(d.endsAt) : null;
  }
  if (d.attendeeIds !== undefined) {
    data.attendees = { set: d.attendeeIds.map((aid) => ({ id: aid })) };
  }
  if (d.remindAt !== undefined) {
    if (d.remindAt) {
      const r = new Date(d.remindAt);
      if (Number.isNaN(r.getTime())) return NextResponse.json({ error: "Invalid reminder time" }, { status: 400 });
      data.remindAt = r;
    } else {
      data.remindAt = null;
    }
    // A changed (or cleared) reminder time is a fresh reminder — reset the
    // sent flag so moving it doesn't just silently skip firing at all.
    data.reminderSentAt = null;
  }

  const meeting = await db.meeting.update({ where: { id }, data, include: meetingInclude });

  if (previousAttendeeIds && d.attendeeIds) {
    const newAttendeeIds = d.attendeeIds.filter((aid) => aid !== user.id && !previousAttendeeIds!.includes(aid));
    for (const aid of newAttendeeIds) {
      await notifyAndPush(
        aid,
        "meeting_invited",
        { meetingId: id, meetingTitle: meeting.title, actorName: user.name },
        { title: "Meeting invite", body: `${user.name} invited you to "${meeting.title}"`, url: "/meetings", tag: "meeting-invited" }
      );
    }
  }

  return NextResponse.json({ meeting });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  if (!(await canManage(user, id))) {
    return NextResponse.json({ error: "Only the organizer can delete this meeting" }, { status: 403 });
  }

  await db.meeting.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
