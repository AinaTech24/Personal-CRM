import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/** Open to any signed-in user — the page itself narrows the list to "every team" for an Admin or "my teams" otherwise. */
export default async function TeamsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return <>{children}</>;
}
