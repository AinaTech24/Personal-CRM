import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { TasksBoard } from "@/components/tasks/tasks-board";

/** Server-side gate for a Permission Manager "block" — the API already refuses the data either way, but this stops the page shell itself from ever rendering for a blocked user. */
export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isModuleBlocked(user, "TASKS")) redirect("/");

  return <TasksBoard />;
}
