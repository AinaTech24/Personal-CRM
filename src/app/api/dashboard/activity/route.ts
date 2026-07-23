import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { leadListWhere } from "@/lib/leads";
import { taskListWhere } from "@/lib/tasks";
import { projectListWhere } from "@/lib/projects";

type Module = "leads" | "tasks" | "meetings" | "projects" | "attendance";
const MODULES: Module[] = ["leads", "tasks", "meetings", "projects", "attendance"];

interface ActivityItem {
  id: string;
  title: string;
  subtitle: string | null;
  /** ISO — the module's own "when": due date, start time, created or worked date. */
  date: string | null;
  status: string | null;
  href: string;
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

  const fromRaw = req.nextUrl.searchParams.get("from");
  const toRaw = req.nextUrl.searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : null;
  const to = toRaw ? new Date(toRaw) : null;
  const admin = isAdmin(user);

  // The interval predicate for whichever date column the module filters on.
  const range: { gte?: Date; lte?: Date } = {};
  if (from && !Number.isNaN(from.getTime())) range.gte = from;
  if (to && !Number.isNaN(to.getTime())) range.lte = to;
  const hasRange = range.gte !== undefined || range.lte !== undefined;

  let items: ActivityItem[] = [];

  if (mod === "leads") {
    const rows = await db.lead.findMany({
      where: { ...leadListWhere(user), ...(hasRange && { createdAt: range }) },
      select: { id: true, name: true, company: true, status: true, createdAt: true },
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
    }));
  } else if (mod === "tasks") {
    const rows = await db.task.findMany({
      where: { ...taskListWhere(user), ...(hasRange && { dueDate: range }) },
      select: { id: true, title: true, status: true, priority: true, dueDate: true },
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
    }));
  } else if (mod === "meetings") {
    const where = admin ? {} : { OR: [{ organizerId: user.id }, { attendees: { some: { id: user.id } } }] };
    const rows = await db.meeting.findMany({
      where: { ...where, ...(hasRange && { startsAt: range }) },
      select: { id: true, title: true, location: true, status: true, startsAt: true },
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
    }));
  } else if (mod === "projects") {
    const rows = await db.project.findMany({
      where: { ...projectListWhere(user), ...(hasRange && { createdAt: range }) },
      select: { id: true, name: true, status: true, createdAt: true, department: { select: { name: true } } },
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
    }));
  } else if (mod === "attendance") {
    // Users see only their own attendance; admins see everyone's.
    const where = admin ? {} : { userId: user.id };
    const rows = await db.attendance.findMany({
      where: { ...where, ...(hasRange && { date: range }) },
      select: {
        id: true,
        date: true,
        status: true,
        calculatedStatus: true,
        checkIn: true,
        user: { select: { name: true } },
      },
      orderBy: { date: "desc" },
      take: 100,
    });
    items = rows.map((a) => ({
      id: a.id,
      title: admin ? a.user.name : new Date(a.date).toLocaleDateString(),
      subtitle: a.checkIn ? new Date(a.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null,
      date: a.date.toISOString(),
      status: a.status ?? a.calculatedStatus ?? null,
      href: admin ? "/admin/attendance" : "/attendance",
    }));
  }

  return NextResponse.json({ module: mod, count: items.length, items });
}
