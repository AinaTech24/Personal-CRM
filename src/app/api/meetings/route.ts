import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

const meetingInclude = {
  organizer: { select: { id: true, name: true, email: true } },
  attendees: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" as const } },
};

/** List meetings the user organizes or attends (admins see all), newest first. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const where = isAdmin(user)
    ? {}
    : { OR: [{ organizerId: user.id }, { attendees: { some: { id: user.id } } }] };

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
  attendeeIds: z.array(z.string()).optional().default([]),
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

  const meeting = await db.meeting.create({
    data: {
      title: d.title,
      description: d.description || null,
      location: d.location || null,
      startsAt,
      endsAt,
      organizerId: user.id,
      attendees: { connect: d.attendeeIds.map((id) => ({ id })) },
    },
    include: meetingInclude,
  });

  return NextResponse.json({ meeting }, { status: 201 });
}
