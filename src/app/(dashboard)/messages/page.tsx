import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isModuleBlocked } from "@/lib/module-permissions-store";
import { ChatView } from "@/components/chat/chat-view";

/**
 * Server-side gate for a Permission Manager "block" (page-level only —
 * conversations are membership-based, not ownership-based like Tasks/
 * Projects/Leads/Meetings/Clients, so blocking MESSAGES doesn't also try to
 * revoke access to conversations this person already legitimately belongs
 * to; it just keeps them from opening the module at all going forward).
 */
export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (await isModuleBlocked(user, "MESSAGES")) redirect("/");

  return <ChatView />;
}
