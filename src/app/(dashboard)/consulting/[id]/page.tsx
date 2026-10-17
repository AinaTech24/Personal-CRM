import { EngagementWorkspace } from "@/components/consulting/engagement-workspace";
import { requireConsultingAccess } from "../access";

export default async function EngagementPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireConsultingAccess();
  const { id } = await params;
  return <EngagementWorkspace id={id} access={access} />;
}
