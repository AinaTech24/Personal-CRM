import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { BirthdaysView } from "@/components/birthdays/birthdays-view";

export default async function BirthdaysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isModuleBlocked(user, "BIRTHDAYS")) redirect("/");

  return <BirthdaysView />;
}
