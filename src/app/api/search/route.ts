import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { leadListWhere } from "@/lib/leads";
import { taskListWhere } from "@/lib/tasks";
import { projectListWhere } from "@/lib/projects";
import { billingListWhere } from "@/lib/billing";
import { callListWhere } from "@/lib/calls";
import { combinedTeamScopeFor } from "@/lib/team-scope";
import { getSocialMembership } from "@/lib/social-media";
import { socialClientListWhere } from "@/lib/social-media-permissions";
import { passwordEntryListWhere } from "@/lib/passwords";

export interface SearchResult {
  type:
    | "lead"
    | "task"
    | "project"
    | "quotation"
    | "invoice"
    | "meeting"
    | "user"
    | "client"
    | "content"
    | "ad"
    | "report"
    | "call"
    | "password"
    | "document"
    | "attendance"
    | "department";
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

const TAKE = 5;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  // A single character fans this out into 16 parallel `contains` queries for
  // results too broad to be useful anyway — not worth the round trip.
  if (q.length < 2) return NextResponse.json({ results: [] });

  const admin = isAdmin(user);
  const meetingVisibility = admin
    ? { deletedAt: null }
    : { AND: [{ deletedAt: null }, { OR: [{ organizerId: user.id }, { attendees: { some: { id: user.id } } }] }] };

  // Shared prerequisites for scoping — resolved once, reused by several queries below.
  const [membership, teamUserIds] = await Promise.all([getSocialMembership(user.id), combinedTeamScopeFor(user)]);
  const clientVisibility = socialClientListWhere(user, membership);
  const callVisibility = callListWhere(user, teamUserIds, false);

  const [
    leads,
    tasks,
    projects,
    quotations,
    invoices,
    meetings,
    users,
    clients,
    content,
    ads,
    reports,
    calls,
    passwords,
    projectDocs,
    taskAttachments,
    departments,
  ] = await Promise.all([
    db.lead.findMany({
      where: {
        AND: [leadListWhere(user), { OR: [{ name: { contains: q } }, { company: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] }],
      },
      select: { id: true, name: true, company: true },
      take: TAKE,
    }),
    db.task.findMany({
      where: { AND: [taskListWhere(user), { OR: [{ title: { contains: q } }, { description: { contains: q } }] }] },
      select: { id: true, title: true, status: true },
      take: TAKE,
    }),
    db.project.findMany({
      where: { AND: [projectListWhere(user), { OR: [{ name: { contains: q } }, { description: { contains: q } }] }] },
      select: { id: true, name: true },
      take: TAKE,
    }),
    db.quotation.findMany({
      where: {
        AND: [
          billingListWhere(user),
          { deletedAt: null },
          { OR: [{ quotationNumber: { contains: q } }, { clientName: { contains: q } }, { subject: { contains: q } }, { notes: { contains: q } }] },
        ],
      },
      select: { id: true, quotationNumber: true, clientName: true },
      take: TAKE,
    }),
    db.invoice.findMany({
      where: {
        AND: [
          billingListWhere(user),
          { deletedAt: null },
          { OR: [{ invoiceNumber: { contains: q } }, { clientName: { contains: q } }, { subject: { contains: q } }, { notes: { contains: q } }] },
        ],
      },
      select: { id: true, invoiceNumber: true, clientName: true },
      take: TAKE,
    }),
    db.meeting.findMany({
      where: { AND: [meetingVisibility, { OR: [{ title: { contains: q } }, { description: { contains: q } }, { location: { contains: q } }] }] },
      select: { id: true, title: true, status: true },
      take: TAKE,
    }),
    // Every authenticated user can search for a colleague by name/email — where they land on the result depends on whether they're an admin.
    db.user.findMany({
      where: { OR: [{ name: { contains: q } }, { surname: { contains: q } }, { email: { contains: q } }] },
      select: { id: true, name: true, surname: true, email: true },
      take: TAKE,
    }),
    // Social Media clients.
    db.socialClient.findMany({
      where: { AND: [clientVisibility, { OR: [{ name: { contains: q } }, { companyName: { contains: q } }, { contactPerson: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] }] },
      select: { id: true, name: true, companyName: true },
      take: TAKE,
    }),
    // Social Media content items (posts/reels/etc.), scoped via their client.
    db.socialContentItem.findMany({
      where: { AND: [{ client: clientVisibility }, { OR: [{ title: { contains: q } }, { caption: { contains: q } }, { hashtags: { contains: q } }] }] },
      select: { id: true, title: true, clientId: true, client: { select: { name: true } } },
      take: TAKE,
    }),
    // Social Media ad campaigns, scoped via their client.
    db.socialAdCampaign.findMany({
      where: { AND: [{ client: clientVisibility }, { OR: [{ name: { contains: q } }, { targetAudience: { contains: q } }, { location: { contains: q } }] }] },
      select: { id: true, name: true, clientId: true, client: { select: { name: true } } },
      take: TAKE,
    }),
    // Social Media monthly reports, scoped via their client.
    db.socialMonthlyReport.findMany({
      where: { AND: [{ client: clientVisibility }, { OR: [{ title: { contains: q } }, { description: { contains: q } }, { insights: { contains: q } }] }] },
      select: { id: true, title: true, clientId: true, client: { select: { name: true } } },
      take: TAKE,
    }),
    // CRM calls.
    db.call.findMany({
      where: { AND: [callVisibility, { OR: [{ clientName: { contains: q } }, { subject: { contains: q } }, { description: { contains: q } }, { nextAction: { contains: q } }] }] },
      select: { id: true, clientName: true, subject: true, callType: true },
      take: TAKE,
    }),
    // Password Manager entries — never selecting the password itself.
    db.passwordEntry.findMany({
      where: { AND: [passwordEntryListWhere(user), { OR: [{ label: { contains: q } }, { description: { contains: q } }, { link: { contains: q } }, { username: { contains: q } }] }] },
      select: { id: true, label: true, link: true },
      take: TAKE,
    }),
    // Project documents, scoped via their project's visibility.
    db.projectDocument.findMany({
      where: { AND: [{ project: projectListWhere(user) }, { fileName: { contains: q } }] },
      select: { id: true, fileName: true, projectId: true, project: { select: { name: true } } },
      take: TAKE,
    }),
    // Task attachments, scoped via their task's own visibility.
    db.taskAttachment.findMany({
      where: { AND: [{ task: taskListWhere(user) }, { fileName: { contains: q } }] },
      select: { id: true, fileName: true, taskId: true, task: { select: { title: true } } },
      take: TAKE,
    }),
    // Departments — admin-only, matching the Departments admin page itself.
    admin
      ? db.department.findMany({ where: { name: { contains: q } }, select: { id: true, name: true }, take: TAKE })
      : Promise.resolve([]),
  ]);

  // Attendance is a per-day record with no free-text field of its own — search by the
  // linked user's name instead, admin-only (matches the Attendance admin page's scope).
  const attendance = admin && q.length > 0
    ? await db.attendance.findMany({
        where: { user: { OR: [{ name: { contains: q } }, { surname: { contains: q } }] } },
        select: { id: true, date: true, user: { select: { name: true, surname: true } } },
        orderBy: { date: "desc" },
        take: TAKE,
      })
    : [];

  const results: SearchResult[] = [
    ...leads.map((l) => ({ type: "lead" as const, id: l.id, title: l.name, subtitle: l.company ?? undefined, href: "/leads" })),
    ...tasks.map((t) => ({ type: "task" as const, id: t.id, title: t.title, subtitle: t.status.replace(/_/g, " "), href: "/tasks" })),
    ...projects.map((p) => ({ type: "project" as const, id: p.id, title: p.name, href: `/projects/${p.id}` })),
    ...quotations.map((qo) => ({ type: "quotation" as const, id: qo.id, title: qo.quotationNumber, subtitle: qo.clientName, href: `/quotations?quotation=${qo.id}` })),
    ...invoices.map((inv) => ({ type: "invoice" as const, id: inv.id, title: inv.invoiceNumber, subtitle: inv.clientName, href: `/invoices?invoice=${inv.id}` })),
    ...meetings.map((m) => ({ type: "meeting" as const, id: m.id, title: m.title, subtitle: m.status.replace(/_/g, " "), href: "/meetings" })),
    ...users.map((u) => ({
      type: "user" as const,
      id: u.id,
      title: [u.name, u.surname].filter(Boolean).join(" "),
      subtitle: u.email,
      href: admin ? `/admin/users/${u.id}` : "/messages",
    })),
    ...clients.map((c) => ({ type: "client" as const, id: c.id, title: c.name, subtitle: c.companyName ?? undefined, href: `/social-media/${c.id}` })),
    ...content.map((c) => ({ type: "content" as const, id: c.id, title: c.title, subtitle: c.client?.name, href: `/social-media/${c.clientId}` })),
    ...ads.map((a) => ({ type: "ad" as const, id: a.id, title: a.name, subtitle: a.client?.name, href: `/social-media/${a.clientId}` })),
    ...reports.map((r) => ({ type: "report" as const, id: r.id, title: r.title ?? "Monthly report", subtitle: r.client?.name, href: `/social-media/${r.clientId}` })),
    ...calls.map((c) => ({ type: "call" as const, id: c.id, title: c.subject ?? c.clientName ?? "Call", subtitle: c.callType.charAt(0) + c.callType.slice(1).toLowerCase(), href: "/calls" })),
    ...passwords.map((p) => ({ type: "password" as const, id: p.id, title: p.label, subtitle: p.link ?? undefined, href: "/passwords" })),
    ...projectDocs.map((d) => ({ type: "document" as const, id: d.id, title: d.fileName, subtitle: d.project?.name, href: `/projects/${d.projectId}` })),
    ...taskAttachments.map((d) => ({ type: "document" as const, id: d.id, title: d.fileName, subtitle: d.task?.title, href: "/tasks" })),
    ...departments.map((d) => ({ type: "department" as const, id: d.id, title: d.name, href: "/admin/departments" })),
    ...attendance.map((a) => ({
      type: "attendance" as const,
      id: a.id,
      title: [a.user?.name, a.user?.surname].filter(Boolean).join(" ") || "Attendance record",
      subtitle: a.date.toISOString().slice(0, 10),
      href: "/admin/attendance",
    })),
  ];

  return NextResponse.json({ results });
}
