import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isDepartmentAdmin } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import { leadListWhere } from "@/lib/leads";
import { taskListWhere } from "@/lib/tasks";
import { projectListWhere } from "@/lib/projects";
import { noteListWhere } from "@/lib/notes";
import { socialClientListWhere } from "@/lib/social-media-permissions";
import { getSocialMembership } from "@/lib/social-media";
import { canManageForms } from "@/lib/forms";
import { birthdayInfo, birthdayDateInYear } from "@/lib/birthdays";
import { toNumber } from "@/lib/billing";
import { dateFromKey, istDateKey, keyFromDate } from "@/lib/attendance";

type Module =
  | "leads"
  | "tasks"
  | "meetings"
  | "projects"
  | "attendance"
  | "clients"
  | "notes"
  | "expenses"
  | "birthdays"
  | "leaves"
  | "forms"
  | "quotations"
  | "invoices";
const MODULES: Module[] = [
  "leads",
  "tasks",
  "meetings",
  "projects",
  "attendance",
  "clients",
  "notes",
  "expenses",
  "birthdays",
  "leaves",
  "forms",
  "quotations",
  "invoices",
];
/** Financial records — shown in the dashboard filter only to admins. */
const ADMIN_ONLY_MODULES = new Set<Module>(["quotations", "invoices"]);

/** Turns a SCREAMING_SNAKE enum value into "Title case". */
function humanize(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * ANDs an extra condition onto a where clause without risking a key clash —
 * `where` may already carry its own top-level `OR` (from a list-scoping
 * helper), and the department condition sometimes needs one of its own
 * (tasks have no departmentId column, so it's "assignee or creator is in
 * this department"). Wrapping in AND keeps the two independent regardless.
 */
function withDepartment<T extends object>(where: T, condition: object | null): T | { AND: [T, object] } {
  return condition ? { AND: [where, condition] } : where;
}

interface ActivityUser {
  name: string;
  avatarDataUrl: string | null;
}

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string | null;
  /** ISO — the module's own "when": due date, start time, created or worked date. */
  date: string | null;
  status: string | null;
  href: string;
  /** Who the record belongs to — assignee for leads/tasks/projects, organiser
   *  for meetings, the record's own owner for attendance. Null when nobody's
   *  assigned (an unassigned lead or task), or the item has no single owner
   *  (a form submission). */
  user: ActivityUser | null;
}

/**
 * A flat, period-filtered list of records for one module, for the dashboard's
 * filter. Scoped to what the caller may see — admins get everything, a
 * Permission Manager grant (or, for Attendance, simply being a Department
 * Admin — same floor /api/dashboard/today-timeline already gives that one
 * module) widens to a department, everyone else gets their own — so the
 * same endpoint serves every dashboard.
 *
 * `from`/`to` are ISO instants the client computes for today / yesterday /
 * upcoming / a custom range, applied to each module's most meaningful date
 * (due date, start time, created/submitted date, or attendance date).
 * Birthdays is the one exception — nobody "creates" a birthday today, so its
 * window instead picks out whose birthday falls in that range this year.
 * The timezone lives on the client, which knows the viewer's; the server
 * just filters the interval.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mod = req.nextUrl.searchParams.get("module") as Module | null;
  if (!mod || !MODULES.includes(mod)) {
    return NextResponse.json({ error: "Unknown module" }, { status: 400 });
  }

  const admin = isAdmin(user);
  // Quotations and invoices are financial records — the UI never offers them
  // to a non-admin, but a direct request for one is refused here too rather
  // than trusted to have come from that UI.
  if (ADMIN_ONLY_MODULES.has(mod) && !admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fromRaw = req.nextUrl.searchParams.get("from");
  const toRaw = req.nextUrl.searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;

  // Narrows to one person's records instead of everything the caller can see.
  // Only admins can point this at someone else — a non-admin passing someone
  // else's id here would otherwise be a way to peek past their own scope, so
  // the param is simply ignored for them and they keep seeing their own data.
  const targetUserId = admin ? req.nextUrl.searchParams.get("userId") : null;

  // Narrows to one department's records instead of everything the caller can
  // see. Admin-only, same reasoning as targetUserId above — a non-admin
  // already sees only their own records, so this would otherwise be a way to
  // peek at a department they don't belong to.
  const departmentId = admin ? req.nextUrl.searchParams.get("department") : null;

  // The interval predicate for whichever date column the module filters on.
  const range: { gte?: Date; lte?: Date } = {};
  if (from && !Number.isNaN(from.getTime())) range.gte = from;
  if (to && !Number.isNaN(to.getTime())) range.lte = to;
  const hasRange = range.gte !== undefined || range.lte !== undefined;

  const userSelect = { select: { name: true, avatarDataUrl: true } } as const;

  let items: ActivityItem[] = [];

  if (mod === "leads") {
    const scope = admin ? ("all" as const) : await moduleAccessScope(user, "LEADS", "READ");
    const rows = await db.lead.findMany({
      where: withDepartment(
        {
          ...leadListWhere(user, null, false, scope),
          ...(targetUserId && { assignedToId: targetUserId }),
          ...(hasRange && { createdAt: range }),
        },
        departmentId ? { departmentId } : null
      ),
      select: { id: true, name: true, company: true, status: true, createdAt: true, assignedTo: userSelect },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    items = rows.map((l) => ({
      id: l.id,
      title: l.name,
      subtitle: l.company,
      date: l.createdAt.toISOString(),
      status: l.status,
      href: "/leads",
      user: l.assignedTo,
    }));
  } else if (mod === "tasks") {
    const scope = admin ? ("all" as const) : await moduleAccessScope(user, "TASKS", "READ");
    const rows = await db.task.findMany({
      // Tasks have no departmentId column — narrow by whichever side (assignee
      // or creator) belongs to the chosen department instead.
      where: withDepartment(
        {
          ...taskListWhere(user, null, false, scope),
          ...(targetUserId && { assignedToId: targetUserId }),
          ...(hasRange && { dueDate: range }),
        },
        departmentId ? { OR: [{ assignedTo: { departmentId } }, { createdBy: { departmentId } }] } : null
      ),
      select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedTo: userSelect },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 100,
    });
    items = rows.map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: t.priority,
      date: t.dueDate ? t.dueDate.toISOString() : null,
      status: t.status,
      href: "/tasks",
      user: t.assignedTo,
    }));
  } else if (mod === "meetings") {
    const scope = admin ? ("all" as const) : await moduleAccessScope(user, "MEETINGS", "READ");
    // A target user's meetings means ones they organised or were invited to —
    // the same definition the personal dashboard uses for "your meetings".
    const where = targetUserId
      ? { OR: [{ organizerId: targetUserId }, { attendees: { some: { id: targetUserId } } }] }
      : scope === "all"
        ? {}
        : { OR: [{ organizerId: user.id }, { attendees: { some: { id: user.id } } }, ...(scope ? [{ organizer: { departmentId: scope.departmentId } }] : [])] };
    const rows = await db.meeting.findMany({
      // No departmentId column on meetings either — scoped to the organizer's department.
      where: withDepartment(
        { ...where, ...(hasRange && { startsAt: range }), deletedAt: null },
        departmentId ? { organizer: { departmentId } } : null
      ),
      select: { id: true, title: true, location: true, status: true, startsAt: true, organizer: userSelect },
      orderBy: { startsAt: "asc" },
      take: 100,
    });
    items = rows.map((m) => ({
      id: m.id,
      title: m.title,
      subtitle: m.location,
      date: m.startsAt.toISOString(),
      status: m.status,
      href: "/meetings",
      user: m.organizer,
    }));
  } else if (mod === "projects") {
    const scope = admin ? ("all" as const) : await moduleAccessScope(user, "PROJECTS", "READ");
    const rows = await db.project.findMany({
      where: withDepartment(
        {
          ...projectListWhere(user, null, false, scope),
          ...(targetUserId && {
            OR: [
              { assignedToId: targetUserId },
              { createdById: targetUserId },
              { members: { some: { userId: targetUserId } } },
            ],
          }),
          ...(hasRange && { createdAt: range }),
        },
        departmentId ? { departmentId } : null
      ),
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        department: { select: { name: true } },
        assignedTo: userSelect,
        createdBy: userSelect,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    items = rows.map((p) => ({
      id: p.id,
      title: p.name,
      subtitle: p.department.name,
      date: p.createdAt.toISOString(),
      status: p.status,
      href: `/projects/${p.id}`,
      // Every project has a creator but not necessarily an assignee — fall
      // back rather than leaving the column blank for the common case.
      user: p.assignedTo ?? p.createdBy,
    }));
  } else if (mod === "attendance") {
    // Users see only their own attendance; admins see everyone's; a
    // Department Admin sees their own department without needing a
    // Permission Manager grant — the same floor /api/dashboard/today-timeline
    // already gives this specific module.
    const where = targetUserId
      ? { userId: targetUserId }
      : admin
        ? {}
        : isDepartmentAdmin(user) && user.departmentId
          ? { user: { departmentId: user.departmentId } }
          : { userId: user.id };
    // `date` is a @db.Date column — MySQL silently truncates a DATETIME filter
    // against it down to a bare date, dropping the time-of-day. The client's
    // "today" window is a UTC instant pair straddling IST midnight (e.g.
    // 18:30 UTC yesterday to 18:29:59 UTC today), so truncating those two
    // instants to dates widens the match to *both* calendar days instead of
    // just today. Re-deriving the bounds as IST calendar-day keys first keeps
    // them aligned with how a row's own `date` was stored in the first place.
    const attendanceRange: { gte?: Date; lte?: Date } = {};
    if (range.gte) attendanceRange.gte = dateFromKey(istDateKey(range.gte));
    if (range.lte) attendanceRange.lte = dateFromKey(istDateKey(range.lte));
    const rows = await db.attendance.findMany({
      // No departmentId column on attendance either — scoped via the row's own user.
      where: withDepartment(
        { ...where, ...(hasRange && { date: attendanceRange }) },
        departmentId ? { user: { departmentId } } : null
      ),
      select: {
        id: true,
        date: true,
        status: true,
        calculatedStatus: true,
        checkIn: true,
        checkOut: true,
        halfDayReason: true,
        overrideReason: true,
        user: userSelect,
      },
      orderBy: { date: "desc" },
      take: 100,
    });
    const time = (d: Date | null) => (d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null);
    // The user column now carries the owner, so the title is always the date —
    // matching what tasks/leads show (a description of the thing, not the person).
    items = rows.map((a) => {
      const checkIn = time(a.checkIn);
      const checkOut = time(a.checkOut);
      // A half-day has a coded reason; a manual status override carries free text.
      const reason = a.halfDayReason ? humanize(a.halfDayReason) : a.overrideReason;
      const subtitle = [
        checkIn && `In ${checkIn}`,
        checkOut && `Out ${checkOut}`,
        reason,
      ]
        .filter(Boolean)
        .join(" · ") || null;
      return {
        id: a.id,
        title: new Date(a.date).toLocaleDateString(),
        subtitle,
        date: a.date.toISOString(),
        // Today's own record has no calculated status yet — checked in with
        // nothing computed reads as "still in progress", not "no status".
        status: a.status ?? a.calculatedStatus ?? (a.checkIn ? "PENDING" : null),
        href: admin ? "/admin/attendance" : "/attendance",
        user: a.user,
      };
    });
  } else if (mod === "clients") {
    const membership = await getSocialMembership(user.id);
    const scope = admin ? ("all" as const) : await moduleAccessScope(user, "CLIENTS", "READ");
    const rows = await db.socialClient.findMany({
      where: withDepartment(
        {
          ...socialClientListWhere(user, membership, scope),
          ...(targetUserId && { OR: [{ createdById: targetUserId }, { assignedToId: targetUserId }] }),
          ...(hasRange && { createdAt: range }),
        },
        departmentId ? { OR: [{ createdBy: { departmentId } }, { assignedTo: { departmentId } }] } : null
      ),
      select: { id: true, name: true, companyName: true, stage: true, createdAt: true, assignedTo: userSelect, createdBy: userSelect },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    items = rows.map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: c.companyName,
      date: c.createdAt.toISOString(),
      status: c.stage,
      href: "/clients",
      user: c.assignedTo ?? c.createdBy,
    }));
  } else if (mod === "notes") {
    const scope = admin ? ("all" as const) : await moduleAccessScope(user, "NOTES", "READ");
    const rows = await db.note.findMany({
      where: withDepartment(
        {
          ...noteListWhere(user, scope),
          ...(targetUserId && { authorId: targetUserId }),
          ...(hasRange && { createdAt: range }),
        },
        departmentId ? { departmentId } : null
      ),
      select: { id: true, title: true, content: true, createdAt: true, author: userSelect },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    items = rows.map((n) => ({
      id: n.id,
      title: n.title || "Untitled note",
      subtitle: n.content ? n.content.slice(0, 80) : null,
      date: n.createdAt.toISOString(),
      status: null,
      href: "/notes",
      user: n.author,
    }));
  } else if (mod === "expenses") {
    // Same three-tier scoping as /api/expenses's own `?scope=all` branch:
    // company-wide for an admin, department-wide for an EXPENSES grantee
    // (Department Admin only — the module is admin-page-only), own claims
    // for everyone else.
    const moduleScope = admin ? ("all" as const) : await moduleAccessScope(user, "EXPENSES", "READ");
    const scopeFilter: object =
      moduleScope === "all" ? {} : moduleScope ? { user: { departmentId: moduleScope.departmentId } } : { userId: user.id };
    const rows = await db.expense.findMany({
      where: withDepartment(
        {
          ...scopeFilter,
          ...(targetUserId && { userId: targetUserId }),
          ...(hasRange && { createdAt: range }),
          deletedAt: null,
        },
        departmentId ? { user: { departmentId } } : null
      ),
      select: { id: true, category: true, categoryOther: true, amount: true, status: true, createdAt: true, user: userSelect },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    items = rows.map((e) => ({
      id: e.id,
      title: e.category === "OTHER" && e.categoryOther ? e.categoryOther : humanize(e.category),
      subtitle: `₹${toNumber(e.amount).toLocaleString("en-IN")}`,
      date: e.createdAt.toISOString(),
      status: e.status,
      href: admin ? "/admin/expenses" : "/expenses",
      user: e.user,
    }));
  } else if (mod === "leaves") {
    // Same three-tier scoping as /api/leave-requests's own `?scope=all` branch.
    const moduleScope = admin ? ("all" as const) : await moduleAccessScope(user, "LEAVE", "READ");
    const scopeFilter: object =
      moduleScope === "all" ? {} : moduleScope ? { user: { departmentId: moduleScope.departmentId } } : { userId: user.id };
    const rows = await db.leaveRequest.findMany({
      where: withDepartment(
        {
          ...scopeFilter,
          ...(targetUserId && { userId: targetUserId }),
          ...(hasRange && { createdAt: range }),
          deletedAt: null,
        },
        departmentId ? { user: { departmentId } } : null
      ),
      select: { id: true, category: true, days: true, status: true, createdAt: true, user: userSelect },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    items = rows.map((l) => ({
      id: l.id,
      title: `${humanize(l.category)} leave`,
      subtitle: `${l.days} day${l.days === 1 ? "" : "s"}`,
      date: l.createdAt.toISOString(),
      status: l.status,
      href: admin ? "/admin/leave" : "/leave",
      user: l.user,
    }));
  } else if (mod === "birthdays") {
    // Not scoped by department/admin at all — a birthday isn't "owned" by the
    // viewer, and everyone already sees the same company-wide birthday
    // banner elsewhere on their dashboard.
    const people = await db.user.findMany({
      where: { isActive: true, birthday: { not: null }, ...(targetUserId && { id: targetUserId }) },
      select: { id: true, name: true, surname: true, avatarDataUrl: true, birthday: true },
    });
    // The window's start day, in IST, is the reference "today" birthdayInfo
    // measures from — matches how the client computed `from` for whichever
    // period (today/yesterday/range) is selected.
    const refKey = from && !Number.isNaN(from.getTime()) ? istDateKey(from) : istDateKey();
    // "Upcoming" has no `to` (open-ended) — cap the look-ahead so it doesn't
    // just list the entire company sorted by nearest birthday.
    const spanDays =
      to && !Number.isNaN(to.getTime()) && from ? Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1) : 30;
    const celebrants = people
      .map((p) => ({ ...p, info: birthdayInfo(keyFromDate(p.birthday!), refKey) }))
      .filter((p) => p.info.daysUntil < spanDays)
      .sort((a, b) => a.info.daysUntil - b.info.daysUntil);
    items = celebrants.slice(0, 100).map((p) => ({
      id: p.id,
      title: `${p.name}${p.surname ? ` ${p.surname}` : ""}`,
      subtitle: p.info.daysUntil === 0 ? "Today" : p.info.daysUntil === 1 ? "Tomorrow" : `Turning ${p.info.turning}`,
      date: dateFromKey(birthdayDateInYear(p.info.month, p.info.day, p.info.year)).toISOString(),
      status: null,
      href: "/birthdays",
      user: { name: p.name, avatarDataUrl: p.avatarDataUrl },
    }));
  } else if (mod === "forms") {
    // Forms is a flat, company-wide capability (same as Birthdays) — admins,
    // department admins (Social Media/CRM lead or a FORMS grant), see every
    // submission; everyone else only submissions for forms their own
    // department was explicitly shared on, or that they created themselves.
    const canSeeAll = await canManageForms(user);
    const rows = await db.formSubmission.findMany({
      where: {
        ...(hasRange && { createdAt: range }),
        ...(canSeeAll
          ? {}
          : {
              form: {
                OR: [
                  { createdById: user.id },
                  ...(user.departmentId ? [{ viewerDepartments: { some: { departmentId: user.departmentId } } } as object] : []),
                ],
              },
            }),
      },
      select: { id: true, createdAt: true, form: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    items = rows.map((s) => ({
      id: s.id,
      title: s.form.title,
      subtitle: "Form submission",
      date: s.createdAt.toISOString(),
      status: null,
      href: `/forms/${s.form.id}/submissions`,
      user: null,
    }));
  } else if (mod === "quotations") {
    // Reachable only by admins (guarded above), so no own-records fallback is
    // needed the way the other modules have one for non-admin callers.
    const rows = await db.quotation.findMany({
      where: withDepartment(
        {
          ...(targetUserId && { createdById: targetUserId }),
          ...(hasRange && { createdAt: range }),
          deletedAt: null,
        },
        departmentId ? { departmentId } : null
      ),
      select: { id: true, quotationNumber: true, clientName: true, status: true, createdAt: true, createdBy: userSelect },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    items = rows.map((q) => ({
      id: q.id,
      title: q.quotationNumber,
      subtitle: q.clientName,
      date: q.createdAt.toISOString(),
      status: q.status,
      href: "/quotations",
      user: q.createdBy,
    }));
  } else if (mod === "invoices") {
    // Reachable only by admins (guarded above).
    const rows = await db.invoice.findMany({
      where: withDepartment(
        {
          ...(targetUserId && { createdById: targetUserId }),
          ...(hasRange && { createdAt: range }),
          deletedAt: null,
        },
        departmentId ? { departmentId } : null
      ),
      select: { id: true, invoiceNumber: true, clientName: true, status: true, createdAt: true, createdBy: userSelect },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    items = rows.map((i) => ({
      id: i.id,
      title: i.invoiceNumber,
      subtitle: i.clientName,
      date: i.createdAt.toISOString(),
      status: i.status,
      href: "/invoices",
      user: i.createdBy,
    }));
  }

  return NextResponse.json({ module: mod, count: items.length, items });
}
