import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { NotesView } from "@/components/notes/notes-view";

export default async function NotesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <NotesView />;
}
