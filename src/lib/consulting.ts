/**
 * MFD Consulting — the Aina MFD Consulting Kit's Control Center, as code.
 *
 * Pure constants and calculations only (no db import), so client components
 * and unit tests can use it — same split as module-permissions.ts vs
 * module-permissions-store.ts. Every catalog below is transcribed from the
 * kit; keys are stable identifiers persisted in the database, labels are
 * free to change.
 */

// ---------- Engagement lifecycle (Methodology Playbook §3 / Control Center "Engagement Status") ----------

export interface LifecycleStage {
  stage: number;
  name: string;
  purpose: string;
  exitCondition: string;
}

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  { stage: 0, name: "Internal Readiness", purpose: "Ensure Aina's scope, templates, consultant roles, data controls and delivery standards are ready.", exitCondition: "Aina delivery system ready" },
  { stage: 1, name: "Lead Qualification", purpose: "Decide whether the MFD is a fit before spending consulting time.", exitCondition: "Fit decision made" },
  { stage: 2, name: "Discovery Meeting", purpose: "Understand business, owner dependency, pain points, systems and goals without trying to solve everything.", exitCondition: "Diagnostic recommended / declined" },
  { stage: 3, name: "Paid Diagnostic", purpose: "Collect data, interview stakeholders, score maturity and identify root causes.", exitCondition: "Baseline and root causes documented" },
  { stage: 4, name: "Findings Meeting", purpose: "Present top risks, quick wins and transformation priorities.", exitCondition: "Priorities agreed" },
  { stage: 5, name: "Proposal / SOW / Contract", purpose: "Agree scope, outcomes, timeline, commercials, responsibilities, exclusions and governance.", exitCondition: "Signed scope and governance" },
  { stage: 6, name: "Kickoff", purpose: "Align sponsor, program owner, function owners, cadence, documentation rules and 30-day plan.", exitCondition: "30-day plan and roles confirmed" },
  { stage: 7, name: "AS-IS Mapping", purpose: "Document how work actually happens today.", exitCondition: "Priority processes mapped" },
  { stage: 8, name: "TO-BE Design", purpose: "Design future-state processes, roles, controls, TATs, KPIs and system requirements.", exitCondition: "Future state approved" },
  { stage: 9, name: "Documentation", purpose: "Create SOPs, checklists, forms, registers, dashboards and training content.", exitCondition: "SOPs/checklists/forms approved" },
  { stage: 10, name: "Technology / Automation", purpose: "Configure CRM, workflow, notifications, dashboards and data controls only after the process is clear.", exitCondition: "Configuration ready" },
  { stage: 11, name: "Pilot", purpose: "Test with a limited scope and capture gaps before rollout.", exitCondition: "Pilot pass / corrective actions" },
  { stage: 12, name: "Training / Certification", purpose: "Teach, demonstrate, let the employee perform, assess and sign off.", exitCondition: "Users certified" },
  { stage: 13, name: "Go-Live", purpose: "Retire old methods and make the new process mandatory.", exitCondition: "New process mandatory" },
  { stage: 14, name: "Stabilization", purpose: "Track issues, adoption, exceptions and training gaps for the first 30 days.", exitCondition: "Critical issues closed" },
  { stage: 15, name: "Ongoing Consulting", purpose: "Weekly implementation reviews, monthly management review, quarterly business review and continuous improvement.", exitCondition: "Cadence operating" },
  { stage: 16, name: "Annual Review / Renewal", purpose: "Re-score maturity, set Year-2 priorities and renew/expand scope.", exitCondition: "Year-2 decision" },
  { stage: 17, name: "Handover / Exit", purpose: "Return control, revoke access, hand over approved documents and close remaining actions.", exitCondition: "Access revoked and handover complete" },
];

export const STAGE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE", "SKIPPED"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
  SKIPPED: "Skipped",
};

/** The stage the engagement is "in": the first one not yet done or skipped — or the last stage once everything is. */
export function currentStage(stages: { stage: number; status: StageStatus }[]): number {
  const open = [...stages].sort((a, b) => a.stage - b.stage).find((s) => s.status !== "DONE" && s.status !== "SKIPPED");
  return open ? open.stage : LIFECYCLE_STAGES.length - 1;
}

/** Share of applicable (non-skipped) stages that are done, 0–1. */
export function lifecycleProgress(stages: { status: StageStatus }[]): number {
  const applicable = stages.filter((s) => s.status !== "SKIPPED");
  if (applicable.length === 0) return 1;
  return applicable.filter((s) => s.status === "DONE").length / applicable.length;
}

export const ENGAGEMENT_STATUSES = ["PROSPECT", "ACTIVE", "ON_HOLD", "COMPLETED", "DECLINED"] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export const ENGAGEMENT_STATUS_LABEL: Record<EngagementStatus, string> = {
  PROSPECT: "Prospect",
  ACTIVE: "Active",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  DECLINED: "Declined",
};

// ---------- Lead qualification gate (Lead Qualification & Discovery Pack §1) ----------

export const QUALIFICATION_CRITERIA = [
  { key: "qOwnerCommitment", label: "Owner commitment", levels: ["Low / absent", "Interested", "Actively sponsors change"] },
  { key: "qProblemUrgency", label: "Problem urgency", levels: ["Nice-to-have", "Visible pain", "Business-critical"] },
  { key: "qTeamReadiness", label: "Team readiness", levels: ["Resistant / unavailable", "Mixed", "Named implementation team"] },
  { key: "qDataVisibility", label: "Data / process visibility", levels: ["None", "Some", "Can share current state"] },
  { key: "qTechnologyOpenness", label: "Technology openness", levels: ["Avoids systems", "Neutral", "Willing to adopt"] },
  { key: "qCommercialFit", label: "Budget / commercial fit", levels: ["Unknown / no", "Needs work", "Fit confirmed"] },
] as const;

export type QualificationKey = (typeof QUALIFICATION_CRITERIA)[number]["key"];
export type QualificationScores = Record<QualificationKey, number | null>;

export type QualificationBand = "STRONG" | "CONDITIONAL" | "NURTURE";

export const QUALIFICATION_BAND_LABEL: Record<QualificationBand, string> = {
  STRONG: "Strong fit",
  CONDITIONAL: "Conditional fit",
  NURTURE: "Nurture or decline",
};

/** Total out of 12 and its band — null band until all six criteria are scored, so a half-filled gate never reads as a verdict. */
export function qualification(scores: QualificationScores): { total: number; scored: number; band: QualificationBand | null } {
  const values = QUALIFICATION_CRITERIA.map((c) => scores[c.key]);
  const scoredValues = values.filter((v): v is number => v !== null && v !== undefined);
  const total = scoredValues.reduce((a, b) => a + b, 0);
  if (scoredValues.length < QUALIFICATION_CRITERIA.length) return { total, scored: scoredValues.length, band: null };
  // Kit's recommended interpretation: 9–12 strong, 6–8 conditional, 0–5 nurture/decline.
  const band: QualificationBand = total >= 9 ? "STRONG" : total >= 6 ? "CONDITIONAL" : "NURTURE";
  return { total, scored: scoredValues.length, band };
}

// ---------- Checklists (Consulting Fit Decision, Client Readiness, Handover) ----------

export interface ChecklistDef {
  key: string;
  label: string;
  items: { key: string; label: string }[];
}

export const CHECKLISTS: ChecklistDef[] = [
  {
    key: "fit",
    label: "Consulting fit decision",
    items: [
      { key: "implementation", label: "Client understands this is an implementation program, not only training" },
      { key: "sponsor", label: "Named sponsor is available" },
      { key: "access", label: "Access/data can be provided securely" },
      { key: "workshops", label: "The team will attend required workshops" },
      { key: "discipline", label: "Client accepts documentation and measurement discipline" },
      { key: "scope", label: "Scope can be defined with reasonable boundaries" },
      { key: "conflict", label: "No material conflict of interest identified" },
      { key: "commercial", label: "Commercial expectations are viable" },
    ],
  },
  {
    key: "readiness",
    label: "Client readiness",
    items: [
      { key: "sponsor", label: "Executive sponsor named" },
      { key: "programOwner", label: "Internal program owner named" },
      { key: "functionOwners", label: "Function owners named" },
      { key: "calendar", label: "Team calendar blocked for workshops" },
      { key: "dataOwner", label: "Data/document owner assigned" },
      { key: "repository", label: "Secure repository available" },
      { key: "systemAccess", label: "Current system access can be provisioned" },
      { key: "approvalSla", label: "Approvals can be provided within agreed SLA" },
      { key: "documentation", label: "Client accepts process documentation discipline" },
      { key: "retireOld", label: "Client accepts that old methods may be retired at go-live" },
      { key: "validator", label: "Compliance/legal validator identified where needed" },
    ],
  },
  {
    key: "handover",
    label: "Handover / exit",
    items: [
      { key: "systemRegister", label: "Final System Register delivered" },
      { key: "processRegister", label: "Final Process Register delivered" },
      { key: "sopRegister", label: "Approved SOP Register delivered" },
      { key: "openActions", label: "Open actions identified" },
      { key: "openRisks", label: "Open risks/issues identified" },
      { key: "trainingRecords", label: "Training records delivered" },
      { key: "misOwnership", label: "Dashboard/MIS ownership transferred" },
      { key: "adminOwnership", label: "System admin ownership transferred where applicable" },
      { key: "clientData", label: "Client data/files returned or retained per agreement" },
      { key: "accessRevocation", label: "Consultant access revocation scheduled" },
      { key: "finalReview", label: "Final management review completed" },
    ],
  },
];

export type ChecklistState = Record<string, Record<string, boolean>>;

export function checklistProgress(def: ChecklistDef, state: ChecklistState | null | undefined) {
  const done = def.items.filter((i) => state?.[def.key]?.[i.key]).length;
  return { done, total: def.items.length };
}

// ---------- Registers (Methodology Playbook §5 / Control Center sheets) ----------

export const REGISTER_KINDS = [
  "ACTION",
  "RISK",
  "ISSUE",
  "DECISION",
  "CHANGE_REQUEST",
  "DELIVERABLE",
  "MEETING",
  "ACCESS",
  "COMMERCIAL",
] as const;
export type RegisterKind = (typeof REGISTER_KINDS)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RegisterPriority = (typeof PRIORITIES)[number];

export type DetailFieldType = "text" | "textarea" | "number" | "date" | "select" | "url";

export interface DetailField {
  key: string;
  label: string;
  type: DetailFieldType;
  options?: { value: string; label: string }[];
  /** Numeric bounds, for number fields. */
  min?: number;
  max?: number;
  /** Shown as a column in the register table, not only in the edit form. */
  column?: boolean;
}

export interface RegisterKindDef {
  kind: RegisterKind;
  /** Plural name for tabs and headings. */
  label: string;
  /** Singular, for "Add …" buttons and dialogs. */
  singular: string;
  /** Prefix for the human ID shown in tables, e.g. "A-007". */
  prefix: string;
  /** What the record's main `title` column means for this kind. */
  titleLabel: string;
  descriptionLabel: string;
  dueDateLabel: string | null;
  /** Whether this kind carries the common owner / priority columns. */
  hasOwner: boolean;
  priorityLabel: string | null;
  statuses: { value: string; label: string }[];
  /** Statuses meaning "no longer needs attention" — excluded from open/overdue counts. */
  closedStatuses: string[];
  details: DetailField[];
}

const MEETING_TYPES = [
  "Discovery",
  "Findings",
  "Kickoff",
  "Implementation Review",
  "Functional Deep Dive",
  "Training",
  "Management Review",
  "Quarterly Business Review",
  "Annual System Review",
  "Other",
].map((t) => ({ value: t, label: t }));

const SCORE_1_5 = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));

export const REGISTER_KIND_DEFS: Record<RegisterKind, RegisterKindDef> = {
  ACTION: {
    kind: "ACTION",
    label: "Actions",
    singular: "Action",
    prefix: "A",
    titleLabel: "Action",
    descriptionLabel: "Notes",
    dueDateLabel: "Due date",
    hasOwner: true,
    priorityLabel: "Priority",
    statuses: [
      { value: "OPEN", label: "Open" },
      { value: "IN_PROGRESS", label: "In progress" },
      { value: "BLOCKED", label: "Blocked" },
      { value: "DONE", label: "Done" },
      { value: "CANCELLED", label: "Cancelled" },
    ],
    closedStatuses: ["DONE", "CANCELLED"],
    details: [
      { key: "source", label: "Meeting / source", type: "text", column: true },
      { key: "dependency", label: "Dependency", type: "text" },
      { key: "evidence", label: "Completion evidence", type: "textarea" },
    ],
  },
  RISK: {
    kind: "RISK",
    label: "Risks",
    singular: "Risk",
    prefix: "R",
    titleLabel: "Risk",
    descriptionLabel: "Details",
    dueDateLabel: "Review date",
    hasOwner: true,
    priorityLabel: null,
    statuses: [
      { value: "OPEN", label: "Open" },
      { value: "MITIGATING", label: "Mitigating" },
      { value: "ACCEPTED", label: "Accepted" },
      { value: "CLOSED", label: "Closed" },
    ],
    closedStatuses: ["ACCEPTED", "CLOSED"],
    details: [
      { key: "category", label: "Category", type: "text", column: true },
      { key: "probability", label: "Probability (1–5)", type: "select", options: SCORE_1_5, column: true },
      { key: "impact", label: "Impact (1–5)", type: "select", options: SCORE_1_5, column: true },
      { key: "mitigation", label: "Mitigation", type: "textarea" },
    ],
  },
  ISSUE: {
    kind: "ISSUE",
    label: "Issues",
    singular: "Issue",
    prefix: "I",
    titleLabel: "Issue",
    descriptionLabel: "Details",
    dueDateLabel: "Due date",
    hasOwner: true,
    priorityLabel: "Severity",
    statuses: [
      { value: "OPEN", label: "Open" },
      { value: "IN_PROGRESS", label: "In progress" },
      { value: "RESOLVED", label: "Resolved" },
      { value: "CLOSED", label: "Closed" },
    ],
    closedStatuses: ["RESOLVED", "CLOSED"],
    details: [
      { key: "area", label: "Process / system", type: "text", column: true },
      { key: "rootCause", label: "Root cause", type: "textarea" },
      { key: "containment", label: "Containment", type: "textarea" },
      { key: "permanentFix", label: "Permanent fix", type: "textarea" },
    ],
  },
  DECISION: {
    kind: "DECISION",
    label: "Decisions",
    singular: "Decision",
    prefix: "D",
    titleLabel: "Decision",
    descriptionLabel: "Context / options considered",
    dueDateLabel: "Effective date",
    hasOwner: false,
    priorityLabel: null,
    statuses: [
      { value: "PROPOSED", label: "Proposed" },
      { value: "APPROVED", label: "Approved" },
      { value: "SUPERSEDED", label: "Superseded" },
    ],
    // A decision is never "overdue" — an approved or superseded one is simply settled.
    closedStatuses: ["APPROVED", "SUPERSEDED"],
    details: [
      { key: "decidedBy", label: "Decided by", type: "text", column: true },
      { key: "impact", label: "Impact", type: "textarea" },
      { key: "affected", label: "Affected document / process", type: "text", column: true },
    ],
  },
  CHANGE_REQUEST: {
    kind: "CHANGE_REQUEST",
    label: "Change requests",
    singular: "Change request",
    prefix: "CR",
    titleLabel: "Requested change",
    descriptionLabel: "Reason",
    dueDateLabel: "Effective date",
    hasOwner: false,
    priorityLabel: null,
    statuses: [
      { value: "SUBMITTED", label: "Submitted" },
      { value: "UNDER_REVIEW", label: "Under review" },
      { value: "APPROVED", label: "Approved" },
      { value: "REJECTED", label: "Rejected" },
    ],
    closedStatuses: ["APPROVED", "REJECTED"],
    details: [
      { key: "requestedBy", label: "Requested by", type: "text", column: true },
      { key: "scopeImpact", label: "Scope impact", type: "textarea" },
      { key: "timelineImpact", label: "Timeline impact", type: "textarea" },
      { key: "commercialImpact", label: "Commercial impact", type: "textarea" },
      { key: "riskImpact", label: "Risk impact", type: "textarea" },
      { key: "recommendation", label: "Aina recommendation", type: "textarea" },
      { key: "approvedBy", label: "Approved by", type: "text", column: true },
    ],
  },
  DELIVERABLE: {
    kind: "DELIVERABLE",
    label: "Deliverables",
    singular: "Deliverable",
    prefix: "DL",
    titleLabel: "Deliverable / document",
    descriptionLabel: "Notes",
    dueDateLabel: "Target date",
    hasOwner: true,
    priorityLabel: null,
    statuses: [
      { value: "DRAFT", label: "Draft" },
      { value: "IN_REVIEW", label: "In review" },
      { value: "APPROVED", label: "Approved" },
      { value: "RETIRED", label: "Retired" },
    ],
    closedStatuses: ["APPROVED", "RETIRED"],
    details: [
      { key: "documentId", label: "Document ID (e.g. OPS-SOP-007)", type: "text", column: true },
      { key: "area", label: "Function / system", type: "text", column: true },
      { key: "version", label: "Version", type: "text", column: true },
      { key: "reviewedBy", label: "Reviewed by", type: "text" },
      { key: "approvedBy", label: "Approved by", type: "text" },
      { key: "approvalDate", label: "Approval date", type: "date" },
      { key: "nextReview", label: "Next review", type: "date" },
      { key: "repository", label: "Repository link", type: "url" },
      { key: "acceptanceEvidence", label: "Acceptance evidence", type: "textarea" },
    ],
  },
  MEETING: {
    kind: "MEETING",
    label: "Meetings & MOMs",
    singular: "Meeting",
    prefix: "M",
    titleLabel: "Meeting",
    descriptionLabel: "Minutes (MOM)",
    dueDateLabel: "Planned date",
    hasOwner: true,
    priorityLabel: null,
    statuses: [
      { value: "SCHEDULED", label: "Scheduled" },
      { value: "HELD", label: "Held — MOM pending" },
      { value: "MOM_SENT", label: "MOM sent" },
      { value: "CANCELLED", label: "Cancelled" },
    ],
    closedStatuses: ["MOM_SENT", "CANCELLED"],
    details: [
      { key: "meetingType", label: "Meeting type", type: "select", options: MEETING_TYPES, column: true },
      { key: "attendees", label: "Attendees", type: "textarea" },
      { key: "actualDate", label: "Actual date", type: "date", column: true },
      { key: "momSentDate", label: "MOM sent on", type: "date" },
      { key: "nextMeeting", label: "Next meeting", type: "date" },
    ],
  },
  ACCESS: {
    kind: "ACCESS",
    label: "Access register",
    singular: "Access grant",
    prefix: "AC",
    titleLabel: "System / repository",
    descriptionLabel: "Notes",
    dueDateLabel: "Review / end date",
    hasOwner: false,
    priorityLabel: null,
    statuses: [
      { value: "REQUESTED", label: "Requested" },
      { value: "ACTIVE", label: "Active" },
      { value: "REVOKED", label: "Revoked" },
    ],
    closedStatuses: ["REVOKED"],
    details: [
      { key: "user", label: "User", type: "text", column: true },
      { key: "purpose", label: "Purpose", type: "text" },
      { key: "accessLevel", label: "Access level", type: "text", column: true },
      { key: "grantedDate", label: "Granted on", type: "date" },
      { key: "approvedBy", label: "Approved by", type: "text" },
      { key: "mfa", label: "MFA", type: "select", options: [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }] },
      { key: "revokedDate", label: "Revoked on", type: "date" },
    ],
  },
  COMMERCIAL: {
    kind: "COMMERCIAL",
    label: "Billing",
    singular: "Billing item",
    prefix: "B",
    titleLabel: "Item",
    descriptionLabel: "Notes",
    dueDateLabel: "Due date",
    hasOwner: false,
    priorityLabel: null,
    statuses: [
      { value: "PLANNED", label: "Planned" },
      { value: "INVOICED", label: "Invoiced" },
      { value: "PAID", label: "Paid" },
      { value: "CANCELLED", label: "Cancelled" },
    ],
    closedStatuses: ["PAID", "CANCELLED"],
    details: [
      {
        key: "type",
        label: "Type",
        type: "select",
        column: true,
        options: ["Diagnostic fee", "Setup / transformation fee", "Monthly retainer", "Technology", "Travel", "Other"].map((t) => ({ value: t, label: t })),
      },
      { key: "amount", label: "Amount (₹, before tax)", type: "number", min: 0, column: true },
      { key: "taxPercent", label: "Tax %", type: "number", min: 0, max: 100 },
      { key: "billingTrigger", label: "Billing trigger", type: "text" },
      { key: "invoiceDate", label: "Invoice date", type: "date" },
      { key: "paidDate", label: "Paid on", type: "date" },
    ],
  },
};

export function isOpenItem(kind: RegisterKind, status: string) {
  return !REGISTER_KIND_DEFS[kind].closedStatuses.includes(status);
}

/** Open and past its due date. `today` is a "YYYY-MM-DD" key, so a record due today isn't yet overdue. */
export function isOverdue(item: { kind: RegisterKind; status: string; dueDate: string | null }, today: string) {
  return !!item.dueDate && item.dueDate < today && isOpenItem(item.kind, item.status);
}

export function formatItemCode(kind: RegisterKind, number: number) {
  return `${REGISTER_KIND_DEFS[kind].prefix}-${String(number).padStart(3, "0")}`;
}

type Details = Record<string, unknown> | null | undefined;

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Risk score = probability × impact (1–25), as in the Control Center's Risk Register; null until both are set. */
export function riskScore(details: Details): number | null {
  const p = num(details?.probability);
  const i = num(details?.impact);
  return p === null || i === null ? null : p * i;
}

/** Billing total = amount × (1 + tax%). */
export function commercialTotal(details: Details): number | null {
  const amount = num(details?.amount);
  if (amount === null) return null;
  const tax = num(details?.taxPercent) ?? 0;
  return Math.round(amount * (1 + tax / 100) * 100) / 100;
}

/** Days from meeting to MOM sent — the RMS "MOM TAT" KPI. */
export function momTatDays(details: Details): number | null {
  const held = typeof details?.actualDate === "string" ? details.actualDate : null;
  const sent = typeof details?.momSentDate === "string" ? details.momSentDate : null;
  if (!held || !sent) return null;
  return Math.round((Date.parse(sent) - Date.parse(held)) / 86_400_000);
}

// ---------- Diagnostic & maturity (MFD_Business_Diagnostic_and_Maturity.xlsx) ----------

export interface Checkpoint {
  key: string;
  label: string;
}

export interface CheckpointGroup {
  key: string;
  label: string;
  checkpoints: Checkpoint[];
}

const group = (key: string, label: string, labels: string[]): CheckpointGroup => ({
  key,
  label,
  checkpoints: labels.map((l, i) => ({ key: `${key}-${i + 1}`, label: l })),
});

/** "7 Functions Audit" sheet. */
export const FUNCTION_AUDIT: CheckpointGroup[] = [
  group("F-MKT", "Marketing", [
    "Defined target segment / ideal client profile",
    "Lead generation sources documented and measured",
    "Referral process exists and is consistently used",
    "Branding / digital activity has calendar and attribution",
    "Lead capture moves into a controlled prospect system",
  ]),
  group("F-SAL", "Sales", [
    "Lead qualification criteria are defined",
    "Pre-sales preparation and meeting process are standardized",
    "Every lead has next action / follow-up visibility",
    "Conversion ratio and conversion time are measured",
    "Proposal/plan handover to operations is controlled",
  ]),
  group("F-OPS", "Operations", [
    "Client onboarding has checklist and owner",
    "Service tasks are centrally tracked",
    "Financial/business transactions are separately tracked",
    "TAT / escalation / exception process exists",
    "Query / complaint / rework is measured",
  ]),
  group("F-LEG", "Legal / Compliance", [
    "Compliance calendar exists and is owned",
    "Client/employee/vendor documents are controlled",
    "Evidence/audit trail is retained",
    "Data access is permissioned and reviewable",
    "Regulatory interpretations have current validation",
  ]),
  group("F-ACC", "Accounts", [
    "Revenue/brokerage reconciliation is systematic",
    "Expenses and budgets are reviewed",
    "Receivables/payables have visibility",
    "Monthly management reporting is timely",
    "Financial close / statutory support process is defined",
  ]),
  group("F-HR", "HR", [
    "Organization structure and reporting lines are clear",
    "JD/JR and competency requirements are documented",
    "Recruitment and onboarding are standardized",
    "Training plan and learning records exist",
    "KRA/KPI and performance review rhythm exist",
  ]),
  group("F-MGT", "Management", [
    "Annual priorities / goals are documented",
    "Weekly/monthly functional review cadence exists",
    "MIS is timely, accurate and decision-oriented",
    "Owner dependency is measured and reduced",
    "Projects and process improvements are governed",
  ]),
];

/** "10 Systems Audit" sheet. */
export const SYSTEMS_AUDIT: CheckpointGroup[] = [
  group("S-MGT", "Strategic Direction / Management", [
    "Vision/mission/values articulated",
    "Annual/quarterly priorities documented",
    "Management reviews drive decisions",
  ]),
  group("S-LGS", "Lead Generation System", [
    "Lead sources defined",
    "Campaign/referral/event process standardized",
    "Lead-source performance measured",
  ]),
  group("S-LCS", "Lead Conversion System", [
    "Pipeline stages defined",
    "Follow-up discipline visible",
    "Conversion ratio/time measured",
  ]),
  group("S-CMS", "Client Management System", [
    "Client data centralized",
    "Service workflows standardized",
    "Reminders/communications tracked",
  ]),
  group("S-RMS", "Review Management System", [
    "Client segmentation defined",
    "Review calendar visible",
    "Pre/during/post review workflow documented",
  ]),
  group("S-ACC", "Accounting System", [
    "Revenue reconciled",
    "Expenses/budget controlled",
    "Management reporting available",
  ]),
  group("S-HR", "HR System", [
    "Recruitment/induction standardized",
    "Training and performance managed",
    "Backup/succession considered",
  ]),
  group("S-CMP", "Compliance System", [
    "Calendar/owner exists",
    "Approvals/evidence retained",
    "Review dates current",
  ]),
  group("S-RND", "R&D / Improvement System", [
    "Breakdowns/breakthroughs captured",
    "Projects governed",
    "SOPs updated from learning",
  ]),
  group("S-IT", "IT / Technology Support", [
    "Systems/access documented",
    "Backups/security/support defined",
    "Automation and dashboards maintained",
  ]),
];

/** "Maturity Score" sheet — each area averages the audit group(s) it's drawn from. */
export const MATURITY_AREAS: { key: string; label: string; groups: string[] }[] = [
  { key: "management", label: "Management", groups: ["F-MGT"] },
  { key: "marketing", label: "Marketing", groups: ["F-MKT"] },
  { key: "sales", label: "Sales", groups: ["F-SAL"] },
  { key: "operations", label: "Operations", groups: ["F-OPS"] },
  { key: "compliance", label: "Legal / Compliance", groups: ["F-LEG"] },
  { key: "accounts", label: "Accounts", groups: ["F-ACC"] },
  { key: "hr", label: "HR", groups: ["F-HR"] },
  { key: "technology", label: "Technology", groups: ["S-IT"] },
  { key: "clientManagement", label: "Client Management", groups: ["S-CMS"] },
  { key: "reviewManagement", label: "Review Management", groups: ["S-RMS"] },
];

/**
 * Only Level 3 ("Process Driven") is named in the kit's workbook; the rest
 * of the ladder follows the Methodology Playbook's stated journey "from
 * founder-dependent working to a documented, measurable, technology-enabled
 * and continuously improving business". Adjust here if Aina standardizes
 * different names.
 */
export const MATURITY_LEVEL_LABEL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Founder Dependent",
  2: "Documented",
  3: "Process Driven",
  4: "Measured",
  5: "Technology-enabled & Continuously Improving",
};

export function maturityLevelLabel(score: number | null): string {
  if (score === null) return "Not scored";
  const level = Math.min(5, Math.max(1, Math.round(score))) as 1 | 2 | 3 | 4 | 5;
  return `Level ${level} — ${MATURITY_LEVEL_LABEL[level]}`;
}

export const DEFAULT_TARGET_MATURITY = 4;

/** "Owner Dependency" sheet functions. */
export const OWNER_DEPENDENCY_FUNCTIONS = [
  { key: "management", label: "Management" },
  { key: "marketing", label: "Marketing" },
  { key: "sales", label: "Sales" },
  { key: "operations", label: "Operations" },
  { key: "compliance", label: "Legal / Compliance" },
  { key: "accounts", label: "Accounts" },
  { key: "hr", label: "HR" },
  { key: "technology", label: "Technology" },
];

export const DEFAULT_OWNER_DEPENDENCY_TARGET = 0.25;

/** "Systemization Score" sheet — five equally weighted (20%) criteria per process. */
export const SYSTEMIZATION_CRITERIA = [
  { key: "defined", label: "Defined" },
  { key: "documented", label: "Documented" },
  { key: "assigned", label: "Assigned" },
  { key: "measured", label: "Measured" },
  { key: "automated", label: "Automated" },
] as const;

export const SYSTEMIZATION_PROCESSES = [
  { key: "leadQualification", label: "Lead Qualification" },
  { key: "salesMeeting", label: "Sales Meeting" },
  { key: "clientOnboarding", label: "Client Onboarding" },
  { key: "mfTransaction", label: "MF Transaction" },
  { key: "serviceQuery", label: "Service Query" },
  { key: "clientReview", label: "Client Review" },
  { key: "recruitment", label: "Recruitment" },
  { key: "monthlyMis", label: "Monthly MIS" },
];

export interface CheckpointEntry {
  score?: number | null;
  evidence?: string;
  priority?: string;
  owner?: string;
  recommendation?: string;
}

export interface OwnerDependencyEntry {
  activities?: string;
  total?: number | null;
  dependent?: number | null;
  target?: number | null;
  actions?: string;
}

export type SystemizationEntry = Partial<Record<(typeof SYSTEMIZATION_CRITERIA)[number]["key"], boolean>> & { next?: string };

export interface AssessmentData {
  checkpoints?: Record<string, CheckpointEntry>;
  targets?: Record<string, number>;
  ownerDependency?: Record<string, OwnerDependencyEntry>;
  systemization?: Record<string, SystemizationEntry>;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

function groupScores(data: AssessmentData, groupKey: string) {
  const g = [...FUNCTION_AUDIT, ...SYSTEMS_AUDIT].find((x) => x.key === groupKey);
  if (!g) return [];
  return g.checkpoints
    .map((c) => data.checkpoints?.[c.key]?.score)
    .filter((s): s is number => typeof s === "number" && s >= 1 && s <= 5);
}

export function groupAverage(data: AssessmentData, groupKey: string): number | null {
  return round2(mean(groupScores(data, groupKey)));
}

export interface MaturityRow {
  key: string;
  label: string;
  current: number | null;
  target: number;
  gap: number | null;
  level: string;
}

export function maturityScorecard(data: AssessmentData): MaturityRow[] {
  return MATURITY_AREAS.map((area) => {
    const current = round2(mean(area.groups.flatMap((g) => groupScores(data, g))));
    const target = data.targets?.[area.key] ?? DEFAULT_TARGET_MATURITY;
    return {
      key: area.key,
      label: area.label,
      current,
      target,
      gap: current === null ? null : round2(target - current),
      level: maturityLevelLabel(current),
    };
  });
}

/** Dependent ÷ total critical activities, per function — null where either count is missing. */
export function ownerDependencyRatio(entry: OwnerDependencyEntry | undefined): number | null {
  if (!entry || entry.total == null || entry.dependent == null || entry.total <= 0) return null;
  return Math.min(1, Math.max(0, entry.dependent / entry.total));
}

export function systemizationScore(entry: SystemizationEntry | undefined): number {
  if (!entry) return 0;
  return SYSTEMIZATION_CRITERIA.filter((c) => entry[c.key]).length / SYSTEMIZATION_CRITERIA.length;
}

export interface AssessmentSummary {
  avgMaturity: number | null;
  avgTarget: number;
  avgOwnerDependency: number | null;
  avgSystemization: number;
  scoredCheckpoints: number;
  totalCheckpoints: number;
  criticalFindings: number;
}

/** The workbook's "Dashboard" sheet. A critical finding is a checkpoint scored 1–2 or flagged HIGH priority. */
export function summarizeAssessment(data: AssessmentData): AssessmentSummary {
  const scorecard = maturityScorecard(data);
  const allCheckpoints = [...FUNCTION_AUDIT, ...SYSTEMS_AUDIT].flatMap((g) => g.checkpoints);
  const entries = allCheckpoints.map((c) => data.checkpoints?.[c.key]);
  const ratios = OWNER_DEPENDENCY_FUNCTIONS.map((f) => ownerDependencyRatio(data.ownerDependency?.[f.key])).filter(
    (r): r is number => r !== null
  );
  return {
    avgMaturity: round2(mean(scorecard.map((r) => r.current).filter((c): c is number => c !== null))),
    avgTarget: round2(mean(scorecard.map((r) => r.target))) ?? DEFAULT_TARGET_MATURITY,
    avgOwnerDependency: round2(mean(ratios)),
    avgSystemization: round2(mean(SYSTEMIZATION_PROCESSES.map((p) => systemizationScore(data.systemization?.[p.key])))) ?? 0,
    scoredCheckpoints: entries.filter((e) => typeof e?.score === "number").length,
    totalCheckpoints: allCheckpoints.length,
    criticalFindings: entries.filter((e) => (typeof e?.score === "number" && e.score <= 2) || e?.priority === "HIGH").length,
  };
}
