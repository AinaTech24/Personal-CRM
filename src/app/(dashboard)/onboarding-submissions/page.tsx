import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { canViewOnboardingSubmissions } from "@/lib/onboarding";
import { OnboardingSubmissionsView } from "@/components/onboarding/onboarding-submissions-view";

export default async function OnboardingSubmissionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canViewOnboardingSubmissions(user)) redirect("/");

  return <OnboardingSubmissionsView />;
}
