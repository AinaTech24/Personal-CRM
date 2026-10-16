import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, type PermissionUser } from "@/lib/permissions";
import { notifyAndPush } from "@/lib/notify";
import { combinedTeamScopeFor } from "@/lib/team-scope";
import { canManageModule } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";

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
 * Only the organizer, an admin, or a Social Media/CRM lead managing a
 * meeting organized by (or attended by) someone on their team may change or
 * remove a meeting.
 */
async function canManage(user: PermissionUser, meetingId: string, action: Extract<ModuleAction, "UPDATE" | "DELETE">) {
  if (isAdmin(user) || (await canManageModule(user, "MEETINGS", action))) return true;
  const m = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { organizerId: true, attendees: { select: { id: true } } },
  });
  if (!m) return false;
  if (m.organizerId === user.id) return true;

  const teamUserIds = await combinedTeamScopeFor(user);
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
    isAdmin(user) ||
    meeting.organizer.id === user.id ||
    meeting.attendees.some((a) => a.id === user.id) ||
    (await canManageModule(user, "MEETINGS", "READ"));
  if (!visible) {
    const teamUserIds = await combinedTeamScopeFor(user);
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

  if (!(await canManage(user, id, "UPDATE"))) {
    return NextResponse.json({ error: "Only the organizer can edit this meeting" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  // Read the attendee list before the update so newly-added attendees can be
  // told apart from ones already on the meeting — an edit that doesn't touch
  // the guest list shouldn't re-notify everyone already invited. Also read
  // the persisted start/end here whenever either is being touched, so
  // editing just one of the two can still be validated against the other's
  // actual stored value instead of only against itself.
  let previousAttendeeIds: string[] | null = null;
  let existingTimes: { startsAt: Date; endsAt: Date | null } | null = null;
  if (d.attendeeIds !== undefined || d.startsAt !== undefined || d.endsAt !== undefined) {
    const existing = await db.meeting.findUnique({
      where: { id },
      select: { startsAt: true, endsAt: true, attendees: { select: { id: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    previousAttendeeIds = existing.attendees.map((a) => a.id);
    existingTimes = { startsAt: existing.startsAt, endsAt: existing.endsAt };
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
  if ((d.startsAt !== undefined || d.endsAt !== undefined) && existingTimes) {
    const effectiveStart = d.startsAt !== undefined ? (data.startsAt as Date) : existingTimes.startsAt;
    const effectiveEnd = d.endsAt !== undefined ? (data.endsAt as Date | null) : existingTimes.endsAt;
    if (effectiveEnd && effectiveEnd < effectiveStart) {
      return NextResponse.json({ error: "End time must be after the start time" }, { status: 400 });
    }
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

  if (!(await canManage(user, id, "DELETE"))) {
    return NextResponse.json({ error: "Only the organizer can delete this meeting" }, { status: 403 });
  }

  await db.meeting.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
