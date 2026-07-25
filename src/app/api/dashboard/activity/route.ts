import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { leadListWhere } from "@/lib/leads";
import { taskListWhere } from "@/lib/tasks";
import { projectListWhere } from "@/lib/projects";
import { dateFromKey, istDateKey } from "@/lib/attendance";

type Module = "leads" | "tasks" | "meetings" | "projects" | "attendance" | "quotations" | "invoices";
const MODULES: Module[] = ["leads", "tasks", "meetings", "projects", "attendance", "quotations", "invoices"];
/** Financial records — shown in the dashboard filter only to admins. */
const ADMIN_ONLY_MODULES = new Set<Module>(["quotations", "invoices"]);

/** Turns a SCREAMING_SNAKE enum value into "Title case". */
function humanize(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
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
   *  assigned (an unassigned lead or task). */
  user: ActivityUser | null;
}

/**
 * A flat, period-filtered list of records for one module, for the dashboard's
 * filter. Scoped to what the caller may see — admins get everything, everyone
 * else gets their own — so the same endpoint serves both dashboards.
 *
 * `from`/`to` are ISO instants the client computes for today / yesterday /
 * upcoming / a custom range, applied to each module's most meaningful date
 * (due date, start time, created or attendance date). The timezone lives on the
 * client, which knows the viewer's; the server just filters the interval.
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

  // The interval predicate for whichever date column the module filters on.
  const range: { gte?: Date; lte?: Date } = {};
  if (from && !Number.isNaN(from.getTime())) range.gte = from;
  if (to && !Number.isNaN(to.getTime())) range.lte = to;
  const hasRange = range.gte !== undefined || range.lte !== undefined;

  const userSelect = { select: { name: true, avatarDataUrl: true } } as const;

  let items: ActivityItem[] = [];

  if (mod === "leads") {
    const rows = await db.lead.findMany({
      where: {
        ...leadListWhere(user),
        ...(targetUserId && { assignedToId: targetUserId }),
        ...(hasRange && { createdAt: range }),
      },
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
    const rows = await db.task.findMany({
      where: {
        ...taskListWhere(user),
        ...(targetUserId && { assignedToId: targetUserId }),
        ...(hasRange && { dueDate: range }),
      },
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
    // A target user's meetings means ones they organised or were invited to —
    // the same definition the personal dashboard uses for "your meetings".
    const where = targetUserId
      ? { OR: [{ organizerId: targetUserId }, { attendees: { some: { id: targetUserId } } }] }
      : admin
        ? {}
        : { OR: [{ organizerId: user.id }, { attendees: { some: { id: user.id } } }] };
    const rows = await db.meeting.findMany({
      where: { ...where, ...(hasRange && { startsAt: range }) },
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
    const rows = await db.project.findMany({
      where: {
        ...projectListWhere(user),
        ...(targetUserId && {
          OR: [
            { assignedToId: targetUserId },
            { createdById: targetUserId },
            { members: { some: { userId: targetUserId } } },
          ],
        }),
        ...(hasRange && { createdAt: range }),
      },
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
    // Users see only their own attendance; admins see everyone's, unless
    // narrowed to one person.
    const where = targetUserId ? { userId: targetUserId } : admin ? {} : { userId: user.id };
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
      where: { ...where, ...(hasRange && { date: attendanceRange }) },
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
  } else if (mod === "quotations") {
    // Reachable only by admins (guarded above), so no own-records fallback is
    // needed the way the other modules have one for non-admin callers.
    const rows = await db.quotation.findMany({
      where: {
        ...(targetUserId && { createdById: targetUserId }),
        ...(hasRange && { createdAt: range }),
      },
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
      where: {
        ...(targetUserId && { createdById: targetUserId }),
        ...(hasRange && { createdAt: range }),
      },
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
