import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { leadListWhere } from "@/lib/leads";
import { taskListWhere } from "@/lib/tasks";
import { projectListWhere } from "@/lib/projects";
import { billingListWhere } from "@/lib/billing";

export interface SearchResult {
  type: "lead" | "task" | "project" | "quotation" | "invoice";
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
  if (q.length < 1) return NextResponse.json({ results: [] });

  const [leads, tasks, projects, quotations, invoices] = await Promise.all([
    db.lead.findMany({
      where: {
        AND: [leadListWhere(user), { OR: [{ name: { contains: q } }, { company: { contains: q } }, { email: { contains: q } }] }],
      },
      select: { id: true, name: true, company: true },
      take: TAKE,
    }),
    db.task.findMany({
      where: { AND: [taskListWhere(user), { title: { contains: q } }] },
      select: { id: true, title: true, status: true },
      take: TAKE,
    }),
    db.project.findMany({
      where: { AND: [projectListWhere(user), { name: { contains: q } }] },
      select: { id: true, name: true },
      take: TAKE,
    }),
    db.quotation.findMany({
      where: { AND: [billingListWhere(user), { OR: [{ quotationNumber: { contains: q } }, { clientName: { contains: q } }] }] },
      select: { id: true, quotationNumber: true, clientName: true },
      take: TAKE,
    }),
    db.invoice.findMany({
      where: { AND: [billingListWhere(user), { OR: [{ invoiceNumber: { contains: q } }, { clientName: { contains: q } }] }] },
      select: { id: true, invoiceNumber: true, clientName: true },
      take: TAKE,
    }),
  ]);

  const results: SearchResult[] = [
    ...leads.map((l) => ({ type: "lead" as const, id: l.id, title: l.name, subtitle: l.company ?? undefined, href: "/leads" })),
    ...tasks.map((t) => ({ type: "task" as const, id: t.id, title: t.title, subtitle: t.status.replace(/_/g, " "), href: "/tasks" })),
    ...projects.map((p) => ({ type: "project" as const, id: p.id, title: p.name, href: `/projects/${p.id}` })),
    ...quotations.map((qo) => ({ type: "quotation" as const, id: qo.id, title: qo.quotationNumber, subtitle: qo.clientName, href: `/quotations?quotation=${qo.id}` })),
    ...invoices.map((inv) => ({ type: "invoice" as const, id: inv.id, title: inv.invoiceNumber, subtitle: inv.clientName, href: `/invoices?invoice=${inv.id}` })),
  ];

  return NextResponse.json({ results });
}
