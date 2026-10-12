import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { hasAnyFormAccess } from "@/lib/forms";
import { FormsListView } from "@/components/forms/forms-list-view";

export default async function FormsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await hasAnyFormAccess(user))) redirect("/");

  return <FormsListView />;
}
