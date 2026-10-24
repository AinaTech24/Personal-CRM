import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { ExpensesView } from "@/components/expenses/expenses-view";

/** Server-side gate for a Permission Manager "block" — the API already refuses the data either way, but this stops the page shell itself from ever rendering for a blocked user. */
export default async function ExpensesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isModuleBlocked(user, "EXPENSES")) redirect("/");

  return <ExpensesView />;
}
