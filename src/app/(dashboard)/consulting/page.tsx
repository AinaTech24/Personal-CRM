import { ConsultingPortfolio } from "@/components/consulting/portfolio";
import { requireConsultingAccess } from "./access";

export default async function ConsultingPage() {
  const access = await requireConsultingAccess();
  return <ConsultingPortfolio access={access} />;
}
