import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewFormSubmissions } from "@/lib/forms";
import { isAdmin } from "@/lib/permissions";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { broadcastLeadChange } from "@/lib/leads";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().max(200).optional().or(z.literal("")).nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
});

/**
 * Turns one submission into a Lead — same permission floor as viewing this
 * form's submissions, plus whatever gates Lead creation everywhere else
 * (isModuleBlocked). The admin reviews/edits the name/company/email/phone
 * the client pre-filled from the answers before this ever gets called, so
 * this only re-validates shape, not content.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await isModuleBlocked(user, "LEADS")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: formId, submissionId } = await params;
  const form = await db.form.findUnique({
    where: { id: formId },
    select: { title: true, viewerDepartments: { select: { departmentId: true } } },
  });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canViewFormSubmissions(user, form.viewerDepartments.map((v) => v.departmentId)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submission = await db.formSubmission.findFirst({ where: { id: submissionId, formId }, select: { id: true, convertedLeadId: true } });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (submission.convertedLeadId) return NextResponse.json({ error: "Already converted to a lead" }, { status: 409 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const lead = await db.lead.create({
    data: {
      name: d.name,
      company: d.company || null,
      email: d.email || null,
      phone: d.phone || null,
      source: `Form: ${form.title}`,
      departmentId: isAdmin(user) ? null : user.departmentId,
      createdById: user.id,
    },
  });
  await db.leadActivity.create({ data: { leadId: lead.id, actorId: user.id, action: "created" } });
  await db.formSubmission.update({ where: { id: submissionId }, data: { convertedLeadId: lead.id } });

  broadcastLeadChange("lead_created", lead);

  return NextResponse.json({ lead }, { status: 201 });
}
