import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { isModuleBlocked, moduleAccessScope } from "@/lib/module-permissions-store";
import { allLedTeamsScopeFor } from "@/lib/teams";
import { resolveTeamScope } from "@/lib/team-scope";
import { dateFromKey, istDateKey } from "@/lib/attendance";
import { leaveSummary, leaveWorkingDays } from "@/lib/leave";
import { leaveRequestInclude, serializeLeaveRequest } from "@/lib/leave-requests";
import { notifyAndPush } from "@/lib/notify";
import { emitToAdmins } from "@/lib/socket-emit";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;

/**
 * Your own requests plus your dashboard numbers. `?scope=all` returns
 * everyone's for a company Admin; a LEAVE-module grantee sees their own
 * department, and the lead of any team (CRM, Social Media, or any other)
 * sees their own team (every widening applies together, not just one) —
 * optionally narrowed further with `?status=`. A team console's own Leave
 * tab instead passes `?teamScope=` (the same "crm"/"social-media"/
 * "team:<id>" values Leads/Tasks/Meetings/Projects already understand) to
 * ask for exactly that one team's requests — company Admin or that team's
 * own lead only, nothing wider.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  if (params.get("scope") === "all") {
    const teamScopeParam = params.get("teamScope");
    if (teamScopeParam) {
      const { teamOnly, teamUserIds } = await resolveTeamScope(user, teamScopeParam);
      if (teamOnly) {
        if (!teamUserIds) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        const status = STATUSES.find((s) => s === params.get("status"));
        const rows = await db.leaveRequest.findMany({
          where: { ...(status ? { status } : {}), userId: { in: teamUserIds } },
          include: leaveRequestInclude,
          orderBy: { createdAt: "desc" },
          take: 500,
        });
        return NextResponse.json({ requests: rows.map(serializeLeaveRequest) });
      }
    }

    const moduleScope = isAdmin(user) ? ("all" as const) : await moduleAccessScope(user, "LEAVE", "READ");
    const teamUserIds = moduleScope === "all" ? [] : await allLedTeamsScopeFor(user);

    if (moduleScope === null && teamUserIds.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let scopeFilter: object = {};
    if (moduleScope !== "all") {
      const or: object[] = [];
      if (teamUserIds.length > 0) or.push({ userId: { in: teamUserIds } });
      if (moduleScope) or.push({ user: { departmentId: moduleScope.departmentId } });
      scopeFilter = { OR: or };
    }

    const status = STATUSES.find((s) => s === params.get("status"));
    const rows = await db.leaveRequest.findMany({
      where: { ...(status ? { status } : {}), ...scopeFilter },
      include: leaveRequestInclude,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json({ requests: rows.map(serializeLeaveRequest) });
  }

  // Only this base "my own requests" case is subject to the company-wide
  // hide — the scope=all/teamScope branches above serve an admin's,
  // grant-holder's, or team lead's view into OTHERS' leave, which "My Leave"
  // being hidden from the regular nav was never meant to take away.
  if (await isModuleBlocked(user, "LEAVE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const year = Number(istDateKey().slice(0, 4));
  const [rows, summary] = await Promise.all([
    db.leaveRequest.findMany({ where: { userId: user.id }, include: leaveRequestInclude, orderBy: { createdAt: "desc" }, take: 200 }),
    leaveSummary(user.id, year),
  ]);
  return NextResponse.json({ requests: rows.map(serializeLeaveRequest), summary, year });
}

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const bodySchema = z.object({
  category: z.enum(["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER"]),
  startDate: dateKey,
  endDate: dateKey,
  isHalfDay: z.boolean().default(false),
  reason: z.string().trim().min(1).max(1000),
});

/** Apply for leave. Duration is worked out here from the working calendar, not taken from the client. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "LEAVE")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
  const d = parsed.data;

  if (Number.isNaN(dateFromKey(d.startDate).getTime()) || Number.isNaN(dateFromKey(d.endDate).getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (d.endDate < d.startDate) return NextResponse.json({ error: "End date can't be before the start date." }, { status: 400 });
  if (d.isHalfDay && d.startDate !== d.endDate) {
    return NextResponse.json({ error: "A half day must be a single date." }, { status: 400 });
  }

  const workingDays = await leaveWorkingDays(d.startDate, d.endDate);
  if (workingDays.length === 0) {
    return NextResponse.json({ error: "That range has no working days (Sundays and holidays don't count)." }, { status: 400 });
  }

  const overlap = await db.leaveRequest.findFirst({
    where: {
      userId: user.id,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dateFromKey(d.endDate) },
      endDate: { gte: dateFromKey(d.startDate) },
    },
    select: { id: true },
  });
  if (overlap) return NextResponse.json({ error: "You already have a leave request covering some of these dates." }, { status: 409 });

  const created = await db.leaveRequest.create({
    data: {
      userId: user.id,
      category: d.category,
      startDate: dateFromKey(d.startDate),
      endDate: dateFromKey(d.endDate),
      isHalfDay: d.isHalfDay,
      days: d.isHalfDay ? 0.5 : workingDays.length,
      reason: d.reason,
    },
    include: leaveRequestInclude,
  });

  // Tell everyone who might need to decide this: every other active company
  // Admin, a LEAVE grantee scoped to the requester's own department (their
  // "support executive"), and the lead of any team the requester belongs to
  // (their "department head") — not just admins, so the person who actually
  // owns this decision hears about it instead of only finding out if they
  // happen to check the list. Each gets routed to wherever they can act on
  // it: admins/grantees to /admin/leave, a team lead to their own team's
  // console (which they may not even be able to reach /admin/leave from).
  const notified = new Set<string>([user.id]);
  const targets: { id: string; url: string }[] = [];

  const admins = await db.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] }, NOT: { id: user.id } },
    select: { id: true },
  });
  for (const a of admins) {
    if (notified.has(a.id)) continue;
    notified.add(a.id);
    targets.push({ id: a.id, url: "/admin/leave" });
  }

  if (user.departmentId) {
    const leaveGrantees = await db.userModulePermission.findMany({
      where: { module: "LEAVE", canUpdate: true, user: { isActive: true, departmentId: user.departmentId } },
      select: { userId: true },
    });
    for (const g of leaveGrantees) {
      if (notified.has(g.userId)) continue;
      notified.add(g.userId);
      targets.push({ id: g.userId, url: "/admin/leave" });
    }
  }

  const myTeams = await db.teamMember.findMany({
    where: { userId: user.id, team: { disabled: false } },
    select: { team: { select: { id: true, slug: true } } },
  });
  if (myTeams.length > 0) {
    const teamLeadRows = await db.teamMember.findMany({
      where: { teamId: { in: myTeams.map((t) => t.team.id) }, isLead: true, user: { isActive: true } },
      select: { userId: true, teamId: true },
    });
    for (const row of teamLeadRows) {
      if (notified.has(row.userId)) continue;
      notified.add(row.userId);
      const slug = myTeams.find((t) => t.team.id === row.teamId)?.team.slug;
      const url = slug === "crm" ? "/crm/team" : slug === "social-media" ? "/social-media/team" : `/teams/${row.teamId}`;
      targets.push({ id: row.userId, url });
    }
  }

  await Promise.all(
    targets.map(({ id, url }) =>
      notifyAndPush(
        id,
        "leave_requested",
        { requestId: created.id, actorName: user.name },
        { title: "New leave request", body: `${user.name} applied for leave`, url, tag: "leave-requested" }
      )
    )
  );
  emitToAdmins("leave_request_changed", { id: created.id });

  return NextResponse.json({ request: serializeLeaveRequest(created) }, { status: 201 });
}
