import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

/**
 * Whether to bounce an already-signed-in user to the dashboard is decided here,
 * not in proxy.ts, because only this side can ask the database whether the
 * session is still live. The edge can verify a token's signature but not its
 * revocation, so a token that looks fine there but resolves to nothing here
 * would ping-pong between the two. getCurrentUser() is the single source of
 * truth for "signed in", and both this page and the dashboard now use it.
 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");
  return <LoginForm />;
}
