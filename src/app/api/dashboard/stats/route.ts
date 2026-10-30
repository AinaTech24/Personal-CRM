import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

type Counts = Record<string, number>;

function tally<T extends { status: string }>(rows: { status: T["status"]; _count: number }[]): Counts {
  const out: Counts = {};
  for (const r of rows) out[r.status] = r._count;
  return out;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Narrows every figure on the panel to one department — same idea as the
  // activity feed's own department filter below it, kept in sync so picking
  // a department changes the whole panel consistently, not just the table.
  const departmentId = req.nextUrl.searchParams.get("department");
  const userWhere = departmentId ? { departmentId } : undefined;
  // Trashed leads are excluded from every count here, same as the live list.
  const leadWhere = departmentId ? { departmentId, deletedAt: null } : { deletedAt: null };
  // Tasks have no departmentId column — a department's tasks are whichever
  // have an assignee or creator that belongs to it.
  const taskWhere = departmentId
    ? { OR: [{ assignedTo: { departmentId } }, { createdBy: { departmentId } }] }
    : undefined;
  const projectWhere = departmentId ? { departmentId } : undefined;
  const quotationWhere = departmentId ? { departmentId } : undefined;
  const invoiceWhere = departmentId ? { departmentId } : undefined;

  const [
    userGroups,
    activeUsers,
    leadGroups,
    taskGroups,
    projectGroups,
    quotationGroups,
    invoiceGroups,
    totalLeads,
    totalTasks,
    totalProjects,
    totalQuotations,
    totalInvoices,
  ] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: true, where: userWhere }),
    db.user.count({ where: { isActive: true, ...userWhere } }),
    db.lead.groupBy({ by: ["status"], _count: true, where: leadWhere }),
    db.task.groupBy({ by: ["status"], _count: true, where: taskWhere }),
    db.project.groupBy({ by: ["status"], _count: true, where: projectWhere }),
    db.quotation.groupBy({ by: ["status"], _count: true, where: quotationWhere }),
    db.invoice.groupBy({ by: ["status"], _count: true, where: invoiceWhere }),
    db.lead.count({ where: leadWhere }),
    db.task.count({ where: taskWhere }),
    db.project.count({ where: projectWhere }),
    db.quotation.count({ where: quotationWhere }),
    db.invoice.count({ where: invoiceWhere }),
  ]);

  const roleCounts: Counts = {};
  let totalUsers = 0;
  for (const g of userGroups) {
    roleCounts[g.role] = g._count;
    totalUsers += g._count;
  }
  const adminUsers = (roleCounts.SUPER_ADMIN ?? 0) + (roleCounts.ADMIN ?? 0);

  return NextResponse.json({
    stats: {
      users: {
        total: totalUsers,
        admins: adminUsers,
        departmentUsers: roleCounts.DEPARTMENT_USER ?? 0,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
      },
      leads: { total: totalLeads, byStatus: tally(leadGroups) },
      tasks: { total: totalTasks, byStatus: tally(taskGroups) },
      projects: { total: totalProjects, byStatus: tally(projectGroups) },
      quotations: { total: totalQuotations, byStatus: tally(quotationGroups) },
      invoices: { total: totalInvoices, byStatus: tally(invoiceGroups) },
    },
  });
}
