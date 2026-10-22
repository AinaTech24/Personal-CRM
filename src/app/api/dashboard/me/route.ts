import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { istDateKey, dateFromKey, keyFromDate, summarize } from "@/lib/attendance";
import { toNumber } from "@/lib/billing";
import { getCrmMembership, hasCrmAccess } from "@/lib/crm-team";
import { getSocialMembership, hasSocialMediaAccess } from "@/lib/social-media";

/**
 * Everything the signed-in user's own dashboard shows, in one round-trip —
 * plus, for a CRM or Social Media team member, a module-specific section
 * (billing/calls, or client/content pipeline) that a Development-team-style
 * user with neither membership simply doesn't get queried for at all.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [crmMembership, socialMembership] = await Promise.all([
    getCrmMembership(user.id),
    getSocialMembership(user.id),
  ]);
  const crmAccess = hasCrmAccess(user, crmMembership);
  const socialAccess = hasSocialMediaAccess(user, socialMembership);

  const todayKey = istDateKey();
  const today = dateFromKey(todayKey);
  const year = Number(todayKey.slice(0, 4));
  const month = Number(todayKey.slice(5, 7));
  const monthStart = dateFromKey(`${todayKey.slice(0, 7)}-01`);
  const monthEnd = dateFromKey(`${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`);
  const now = new Date();

  const [
    attendanceToday,
    monthRecords,
    leaveToday,
    tasks,
    leads,
    meetings,
    recentProjects,
    projectCount,
    memberships,
    quotations,
    quotationCount,
    invoices,
    invoiceCount,
    calls,
    socialClientCount,
    pendingContent,
    pendingContentCount,
  ] = await Promise.all([
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
      db.project.findMany({
        where: { OR: [{ assignedToId: user.id }, { members: { some: { userId: user.id } } }] },
        select: { id: true, name: true, status: true, progress: true, endDate: true },
        orderBy: { updatedAt: "desc" },
        take: 4,
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
      crmAccess
        ? db.quotation.findMany({
            where: { createdById: user.id, status: { notIn: ["APPROVED", "REJECTED", "EXPIRED"] } },
            select: { id: true, quotationNumber: true, clientName: true, status: true, total: true, validUntil: true },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      crmAccess
        ? db.quotation.count({ where: { createdById: user.id, status: { notIn: ["APPROVED", "REJECTED", "EXPIRED"] } } })
        : Promise.resolve(0),
      crmAccess
        ? db.invoice.findMany({
            where: { createdById: user.id, status: { notIn: ["PAID", "CANCELLED"] } },
            select: { id: true, invoiceNumber: true, clientName: true, status: true, total: true },
            orderBy: { createdAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      crmAccess
        ? db.invoice.count({ where: { createdById: user.id, status: { notIn: ["PAID", "CANCELLED"] } } })
        : Promise.resolve(0),
      crmAccess
        ? db.call.findMany({
            where: { OR: [{ ownerId: user.id }, { createdById: user.id }] },
            select: {
              id: true,
              clientName: true,
              callType: true,
              startTime: true,
              nextAction: true,
              lead: { select: { name: true } },
            },
            orderBy: { startTime: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      socialAccess
        ? db.socialClient.count({ where: { OR: [{ createdById: user.id }, { assignedToId: user.id }] } })
        : Promise.resolve(0),
      socialAccess
        ? db.socialContentItem.findMany({
            where: { createdById: user.id, stage: { notIn: ["PUBLISHED", "CANCELLED"] } },
            select: {
              id: true,
              title: true,
              type: true,
              stage: true,
              scheduledFor: true,
              client: { select: { name: true } },
            },
            orderBy: { updatedAt: "desc" },
            take: 5,
          })
        : Promise.resolve([]),
      socialAccess
        ? db.socialContentItem.count({ where: { createdById: user.id, stage: { notIn: ["PUBLISHED", "CANCELLED"] } } })
        : Promise.resolve(0),
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
    projects: { total: projectCount, recent: recentProjects },
    unreadChats,
    attendanceDateKey: keyFromDate(today),
    crm: crmAccess
      ? {
          quotations: {
            open: quotationCount,
            recent: quotations.map((q) => ({
              id: q.id,
              number: q.quotationNumber,
              clientName: q.clientName,
              status: q.status,
              total: toNumber(q.total),
              validUntil: q.validUntil,
            })),
          },
          invoices: {
            open: invoiceCount,
            recent: invoices.map((i) => ({
              id: i.id,
              number: i.invoiceNumber,
              clientName: i.clientName,
              status: i.status,
              total: toNumber(i.total),
            })),
          },
          calls: calls.map((c) => ({
            id: c.id,
            clientName: c.clientName ?? c.lead?.name ?? "Unknown",
            callType: c.callType,
            startTime: c.startTime,
            nextAction: c.nextAction,
          })),
        }
      : null,
    socialMedia: socialAccess
      ? {
          clients: socialClientCount,
          pendingContent: pendingContentCount,
          content: pendingContent.map((c) => ({
            id: c.id,
            title: c.title,
            type: c.type,
            stage: c.stage,
            scheduledFor: c.scheduledFor,
            clientName: c.client.name,
          })),
        }
      : null,
  });
}
