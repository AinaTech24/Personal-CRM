import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms } from "@/lib/forms";
import { FormBuilderView } from "@/components/forms/form-builder-view";

export default async function FormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canManageForms(user))) redirect("/forms");

  const { id } = await params;
  return <FormBuilderView formId={id} />;
}
