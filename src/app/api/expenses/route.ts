import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { moduleAccessScope } from "@/lib/module-permissions-store";
import { allLedTeamsScopeFor } from "@/lib/teams";
import { resolveTeamScope } from "@/lib/team-scope";
import { dateFromKey } from "@/lib/attendance";
import { expenseInclude, serializeExpense } from "@/lib/expenses";
import { saveExpenseReceipt, UploadValidationError, MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { toNumber } from "@/lib/billing";
import { notifyAndPush } from "@/lib/notify";
import { emitToAdmins } from "@/lib/socket-emit";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "PAID"] as const;
const CATEGORIES = ["TRAVEL", "FOOD", "ACCOMMODATION", "OFFICE_SUPPLIES", "SOFTWARE", "CLIENT_ENTERTAINMENT", "OTHER"] as const;

/**
 * Your own expense claims plus your dashboard numbers. `?scope=all` returns
 * everyone's for a company Admin; an EXPENSES-module grantee (a department
 * admin / "support executive") sees their own department, and the lead of
 * any team sees their own team (every widening applies together) —
 * optionally narrowed further with `?status=`. Same scoping shape as
 * /api/leave-requests — see its comment for the full reasoning.
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
        const rows = await db.expense.findMany({
          where: { ...(status ? { status } : {}), userId: { in: teamUserIds } },
          include: expenseInclude,
          omit: { receiptData: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        });
        return NextResponse.json({ expenses: rows.map(serializeExpense) });
      }
    }

    const moduleScope = isAdmin(user) ? ("all" as const) : await moduleAccessScope(user, "EXPENSES", "READ");
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
    const rows = await db.expense.findMany({
      where: { ...(status ? { status } : {}), ...scopeFilter },
      include: expenseInclude,
      omit: { receiptData: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return NextResponse.json({ expenses: rows.map(serializeExpense) });
  }

  const [rows, totals] = await Promise.all([
    db.expense.findMany({ where: { userId: user.id }, include: expenseInclude, omit: { receiptData: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.expense.groupBy({ by: ["status"], where: { userId: user.id }, _sum: { amount: true } }),
  ]);
  const sumFor = (status: (typeof STATUSES)[number]) => toNumber(totals.find((t) => t.status === status)?._sum.amount ?? 0);
  const summary = {
    pending: sumFor("PENDING"),
    approved: sumFor("APPROVED"),
    paid: sumFor("PAID"),
    rejected: sumFor("REJECTED"),
  };
  return NextResponse.json({ expenses: rows.map(serializeExpense), summary });
}

const bodySchema = z.object({
  category: z.enum(CATEGORIES),
  amount: z.coerce.number().positive().max(10_000_000),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(1000),
});

/** Submit a reimbursement claim — fields plus an optional receipt, as one multipart request. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const parsed = bodySchema.safeParse({
    category: formData.get("category"),
    amount: formData.get("amount"),
    expenseDate: formData.get("expenseDate"),
    description: formData.get("description"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
  const d = parsed.data;

  if (Number.isNaN(dateFromKey(d.expenseDate).getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  const receipt = formData.get("receipt");
  if (receipt instanceof File && receipt.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `Receipt exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB limit` }, { status: 400 });
  }

  const created = await db.expense.create({
    data: {
      userId: user.id,
      category: d.category,
      amount: d.amount,
      expenseDate: dateFromKey(d.expenseDate),
      description: d.description,
    },
  });

  if (receipt instanceof File && receipt.size > 0) {
    try {
      const { filePath, fileName, data } = await saveExpenseReceipt(created.id, receipt);
      await db.expense.update({
        where: { id: created.id },
        data: { receiptFileName: fileName, receiptFilePath: filePath, receiptData: data },
      });
    } catch (err) {
      if (err instanceof UploadValidationError) {
        // The claim itself is already saved — a bad receipt shouldn't lose it, just skip attaching one.
      } else {
        throw err;
      }
    }
  }

  // Same three-tier recipient pattern as /api/leave-requests: every other
  // active company Admin, an EXPENSES grantee scoped to the requester's own
  // department (their "support executive"), and the lead of any team the
  // requester belongs to (their "department head") — each routed to
  // wherever they can act on it.
  const notified = new Set<string>([user.id]);
  const targets: { id: string; url: string }[] = [];

  const admins = await db.user.findMany({
    where: { isActive: true, role: { in: ["ADMIN", "SUPER_ADMIN"] }, NOT: { id: user.id } },
    select: { id: true },
  });
  for (const a of admins) {
    if (notified.has(a.id)) continue;
    notified.add(a.id);
    targets.push({ id: a.id, url: "/admin/expenses" });
  }

  if (user.departmentId) {
    const grantees = await db.userModulePermission.findMany({
      where: { module: "EXPENSES", canUpdate: true, user: { isActive: true, departmentId: user.departmentId } },
      select: { userId: true },
    });
    for (const g of grantees) {
      if (notified.has(g.userId)) continue;
      notified.add(g.userId);
      targets.push({ id: g.userId, url: "/admin/expenses" });
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
        "expense_requested",
        { expenseId: created.id, actorName: user.name },
        { title: "New expense claim", body: `${user.name} submitted a reimbursement claim`, url, tag: "expense-requested" }
      )
    )
  );
  emitToAdmins("expense_request_changed", { id: created.id });

  const withRelations = await db.expense.findUniqueOrThrow({ where: { id: created.id }, include: expenseInclude, omit: { receiptData: true } });
  return NextResponse.json({ expense: serializeExpense(withRelations) }, { status: 201 });
}
