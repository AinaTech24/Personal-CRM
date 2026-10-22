import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { MeetingsView } from "@/components/meetings/meetings-view";

/** Server-side gate for a Permission Manager "block" — the API already refuses the data either way, but this stops the page shell itself from ever rendering for a blocked user. */
export default async function MeetingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isModuleBlocked(user, "MEETINGS")) redirect("/");

  return <MeetingsView />;
}
