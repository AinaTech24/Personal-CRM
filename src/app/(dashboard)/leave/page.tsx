import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { LeaveView } from "@/components/leave/leave-view";

export default async function LeavePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isModuleBlocked(user, "LEAVE")) redirect("/");

  return <LeaveView />;
}
