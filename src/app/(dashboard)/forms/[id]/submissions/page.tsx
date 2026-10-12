import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewFormSubmissions } from "@/lib/forms";
import { FormSubmissionsView } from "@/components/forms/form-submissions-view";

export default async function FormSubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const form = await db.form.findUnique({ where: { id }, include: { viewerDepartments: { select: { departmentId: true } } } });
  if (!form) redirect("/forms");
  if (!canViewFormSubmissions(user, form.viewerDepartments.map((v) => v.departmentId))) redirect("/forms");

  return <FormSubmissionsView formId={id} />;
}
