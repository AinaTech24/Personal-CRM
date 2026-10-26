import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { AttendanceView } from "@/components/attendance/attendance-view";

export default async function AttendancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isModuleBlocked(user, "ATTENDANCE")) redirect("/");

  return <AttendanceView />;
}
