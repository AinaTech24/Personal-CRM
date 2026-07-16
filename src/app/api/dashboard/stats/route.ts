import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

type Counts = Record<string, number>;

function tally<T extends { status: string }>(rows: { status: T["status"]; _count: number }[]): Counts {
  const out: Counts = {};
  for (const r of rows) out[r.status] = r._count;
  return out;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    db.user.groupBy({ by: ["role"], _count: true }),
    db.user.count({ where: { isActive: true } }),
    db.lead.groupBy({ by: ["status"], _count: true }),
    db.task.groupBy({ by: ["status"], _count: true }),
    db.project.groupBy({ by: ["status"], _count: true }),
    db.quotation.groupBy({ by: ["status"], _count: true }),
    db.invoice.groupBy({ by: ["status"], _count: true }),
    db.lead.count(),
    db.task.count(),
    db.project.count(),
    db.quotation.count(),
    db.invoice.count(),
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
