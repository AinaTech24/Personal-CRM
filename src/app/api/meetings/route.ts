import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { notifyAndPush } from "@/lib/notify";
import { resolveTeamScope } from "@/lib/team-scope";
import { canManageModule } from "@/lib/module-permissions-store";

const meetingInclude = {
  organizer: { select: { id: true, name: true, email: true } },
  attendees: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" as const } },
};

/**
 * List meetings the user organizes or attends (admins see all), newest
 * first. A Social Media lead additionally sees every meeting organized by,
 * or attended by, anyone on their team.
 *
 * The Social Media / CRM Team console's Meetings tab passes
 * `scope=social-media|crm` to explicitly ask for the team-only view —
 * narrower than an Admin's usual `{}` company-wide list, which has no team
 * concept built in.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamOnly, teamUserIds } = await resolveTeamScope(user, req.nextUrl.searchParams.get("scope"));
  if (teamOnly && !teamUserIds) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let where: object;
  if (teamOnly && teamUserIds) {
    where = { OR: [{ organizerId: { in: teamUserIds } }, { attendees: { some: { id: { in: teamUserIds } } } }] };
  } else {
    const or: object[] = [{ organizerId: user.id }, { attendees: { some: { id: user.id } } }];
    if (teamUserIds && teamUserIds.length > 0) {
      or.push({ organizerId: { in: teamUserIds } }, { attendees: { some: { id: { in: teamUserIds } } } });
    }
    where = isAdmin(user) || (await canManageModule(user, "MEETINGS", "READ")) ? {} : { OR: or };
  }

  const meetings = await db.meeting.findMany({
    where,
    include: meetingInclude,
    orderBy: { startsAt: "desc" },
  });
  return NextResponse.json({ meetings });
}

const bodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  location: z.string().max(500).optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string().optional().nullable(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).optional().default("SCHEDULED"),
  attendeeIds: z.array(z.string()).optional().default([]),
  remindAt: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const startsAt = new Date(d.startsAt);
  if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
  const endsAt = d.endsAt ? new Date(d.endsAt) : null;
  if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt < startsAt)) {
    return NextResponse.json({ error: "End time must be after the start time" }, { status: 400 });
  }
  let remindAt: Date | null = null;
  if (d.remindAt) {
    remindAt = new Date(d.remindAt);
    if (Number.isNaN(remindAt.getTime())) return NextResponse.json({ error: "Invalid reminder time" }, { status: 400 });
  }

  const meeting = await db.meeting.create({
    data: {
      title: d.title,
      description: d.description || null,
      location: d.location || null,
      startsAt,
      endsAt,
      status: d.status,
      organizerId: user.id,
      attendees: { connect: d.attendeeIds.map((id) => ({ id })) },
      remindAt,
    },
    include: meetingInclude,
  });

  for (const attendeeId of d.attendeeIds) {
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
