import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { NotesView } from "@/components/notes/notes-view";

export default async function NotesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isModuleBlocked(user, "NOTES")) redirect("/");

  return <NotesView />;
}
