import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageUsers } from "@/lib/permissions";
import { summarize, istDateKey, dateFromKey, keyFromDate } from "@/lib/attendance";

/** Admin: one user's records across every module, for the user detail page. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me || !canManageUsers(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    include: { department: true },
    omit: {
      passwordHash: true,
      resetCode: true,
      resetCodeExpiresAt: true,
      pinHash: true,
      pinResetCode: true,
      pinResetCodeExpiresAt: true,
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const year = Number(istDateKey().slice(0, 4));
  const yearStart = dateFromKey(`${year}-01-01`);
  const yearEnd = dateFromKey(`${year}-12-31`);

  const [leads, tasks, projects, meetings, quotations, invoices, attendance] = await Promise.all([
    db.lead.findMany({
      where: { assignedToId: id },
      select: { id: true, name: true, company: true, status: true, priority: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.task.findMany({
      where: { assignedToId: id },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.project.findMany({
      where: { OR: [{ assignedToId: id }, { members: { some: { userId: id } } }] },
      select: { id: true, name: true, status: true, progress: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.meeting.findMany({
      where: { OR: [{ organizerId: id }, { attendees: { some: { id } } }] },
      select: { id: true, title: true, startsAt: true, status: true },
      orderBy: { startsAt: "desc" },
      take: 200,
    }),
    db.quotation.findMany({
      where: { createdById: id },
      select: { id: true, quotationNumber: true, clientName: true, status: true, total: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.invoice.findMany({
      where: { createdById: id },
      select: { id: true, invoiceNumber: true, clientName: true, status: true, total: true, invoiceDate: true },
      orderBy: { invoiceDate: "desc" },
      take: 200,
    }),
    db.attendance.findMany({
      where: { userId: id, date: { gte: yearStart, lte: yearEnd } },
      orderBy: { date: "desc" },
    }),
  ]);

  return NextResponse.json({
    user,
    leads,
    tasks,
    projects,
    meetings,
    quotations: quotations.map((q) => ({ ...q, total: Number(q.total) })),
    invoices: invoices.map((i) => ({ ...i, total: Number(i.total) })),
    attendance: {
      year,
      summary: summarize(attendance),
      records: attendance.slice(0, 60).map((a) => ({
        date: keyFromDate(a.date),
        status: a.status,
        approvalStatus: a.approvalStatus,
        checkIn: a.checkIn,
        checkOut: a.checkOut,
        workedMinutes: a.workedMinutes,
      })),
    },
  });
}
