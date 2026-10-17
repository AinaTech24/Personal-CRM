import type {
  AssessmentData,
  ChecklistState,
  EngagementStatus,
  QualificationBand,
  QualificationKey,
  RegisterKind,
  StageStatus,
} from "@/lib/consulting";

export interface PersonRef {
  id: string;
  name: string | null;
}

export interface Stage {
  stage: number;
  status: StageStatus;
  owner: PersonRef | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualEnd: string | null;
  percentComplete: number;
  notes: string | null;
}

export interface Health {
  openActions: number;
  overdueActions: number;
  openRisks: number;
  highRisks: number;
  openIssues: number;
  approvedDeliverables: number;
  nextMeeting: string | null;
}

export type Engagement = {
  id: string;
  firmName: string;
  contactPerson: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  entityType: string | null;
  yearsInBusiness: number | null;
  aumCrore: number | null;
  monthlySipLakh: number | null;
  families: number | null;
  teamSize: number | null;
  branches: number | null;
  products: string | null;
  currentTools: string | null;
  leadSource: string | null;
  primaryPainPoint: string | null;
  whyNow: string | null;
  decisionMaker: string | null;
  budgetReadiness: string | null;
  ownerTimeCommitment: string | null;
  preferredStart: string | null;
  qualification: { total: number; scored: number; band: QualificationBand | null };
  status: EngagementStatus;
  executiveSponsor: string | null;
  programOwner: string | null;
  leadConsultant: PersonRef | null;
  startDate: string | null;
  contractEndDate: string | null;
  weeklyReviewDay: string | null;
  monthlyReviewDay: string | null;
  repositoryLink: string | null;
  primaryGoals: string | null;
  notes: string | null;
  checklists: ChecklistState;
  stages: Stage[];
  currentStage: number;
  progress: number;
  health?: Health;
  createdAt: string;
  updatedAt: string;
} & Record<QualificationKey, number | null>;

export interface RegisterItem {
  id: string;
  engagementId: string;
  kind: RegisterKind;
  number: number;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  owner: PersonRef | null;
  ownerName: string | null;
  dueDate: string | null;
  closedAt: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Assessment {
  id: string;
  engagementId: string;
  label: string;
  assessedOn: string;
  data: AssessmentData;
  createdAt: string;
  updatedAt: string;
}

export interface ConsultingAccess {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface AssignableUser {
  id: string;
  name: string;
  surname?: string | null;
}

export const userLabel = (u: { name: string; surname?: string | null }) => [u.name, u.surname].filter(Boolean).join(" ");
