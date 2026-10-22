import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { istDateKey, dateFromKey, keyFromDate, summarize } from "@/lib/attendance";

/** Everything the signed-in user's own dashboard shows, in one round-trip. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const todayKey = istDateKey();
  const today = dateFromKey(todayKey);
  const year = Number(todayKey.slice(0, 4));
  const month = Number(todayKey.slice(5, 7));
  const monthStart = dateFromKey(`${todayKey.slice(0, 7)}-01`);
  const monthEnd = dateFromKey(`${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`);
  const now = new Date();

  const [attendanceToday, monthRecords, leaveToday, tasks, leads, meetings, projectCount, memberships] =
    await Promise.all([
      db.attendance.findUnique({ where: { userId_date: { userId: user.id, date: today } } }),
      db.attendance.findMany({
        where: { userId: user.id, date: { gte: monthStart, lte: monthEnd } },
        select: { status: true, approvalStatus: true },
      }),
      db.userLeave.findUnique({ where: { userId_date: { userId: user.id, date: today } } }),
      db.task.findMany({
        where: {
          OR: [{ assignedToId: user.id }, { assignees: { some: { id: user.id } } }],
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        select: { id: true, title: true, status: true, priority: true, dueDate: true },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 50,
      }),
      db.lead.findMany({
        where: { assignedToId: user.id, status: { notIn: ["WON", "LOST"] } },
        select: { id: true, name: true, company: true, status: true, priority: true },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      db.meeting.findMany({
        where: {
          status: "SCHEDULED",
          startsAt: { gte: now },
          OR: [{ organizerId: user.id }, { attendees: { some: { id: user.id } } }],
        },
        select: { id: true, title: true, startsAt: true, location: true },
        orderBy: { startsAt: "asc" },
        take: 5,
      }),
      db.project.count({
        where: { OR: [{ assignedToId: user.id }, { members: { some: { userId: user.id } } }] },
      }),
      db.conversationMember.findMany({
        where: { userId: user.id },
        select: {
          lastReadAt: true,
          conversation: {
            select: { messages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, senderId: true } } },
          },
        },
      }),
    ]);

  // A conversation counts as unread when its newest message is someone else's
  // and arrived after this member last opened it.
  const unreadChats = memberships.filter((m) => {
    const last = m.conversation.messages[0];
    return !!last && last.senderId !== user.id && (!m.lastReadAt || last.createdAt > m.lastReadAt);
  }).length;

  const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < now).length;
  const dueToday = tasks.filter((t) => t.dueDate && t.dueDate >= now && t.dueDate < endOfToday).length;

  return NextResponse.json({
    todayKey,
    attendance: {
      checkIn: attendanceToday?.checkIn ?? null,
      checkOut: attendanceToday?.checkOut ?? null,
      status: attendanceToday?.status ?? null,
      workedMinutes: attendanceToday?.workedMinutes ?? null,
      onLeave: leaveToday ? { type: leaveToday.type, reason: leaveToday.reason } : null,
      monthSummary: summarize(monthRecords),
    },
    tasks: {
      open: tasks.length,
      overdue,
      dueToday,
      upcoming: tasks.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
      })),
    },
    leads: { open: leads.length, recent: leads },
    meetings: meetings.map((m) => ({ ...m, startsAt: m.startsAt })),
    projects: projectCount,
    unreadChats,
    attendanceDateKey: keyFromDate(today),
  });
}
