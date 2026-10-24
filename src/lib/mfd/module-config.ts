/**
 * Per-table behaviour the field dictionary implies but doesn't spell out as
 * data: reference-number formats, which fields only the server may set,
 * which statuses count as approvals (need the P permission), how a support
 * table hangs off its parent module, and how each table lists and labels.
 */

export type TableMode =
  /** Normal create + update (+ archive where the table has archived_at). */
  | "editable"
  /** Rows are added, never changed (versions, allocations). */
  | "append-only"
  /** Written only by the server (audit trails, computed scores, outbox). */
  | "read-only";

export interface TableConfig {
  numbering?: { field: string; prefix: string; yearly: boolean };
  /** Columns a client may never write, beyond the audit columns. */
  serverFields?: string[];
  /** Statuses a record may only enter through a dedicated action, not PATCH. */
  actionOnlyStatuses?: string[];
  labelField: string;
  listColumns: string[];
  searchFields: string[];
  statusField?: string;
  /** Entering one of these statuses requires the P (approve) permission. */
  approvalStatuses?: string[];
  /** Support tables: the module table whose permissions apply, or "admin". */
  permissionTable?: string;
  /** Support tables without mfd_org_id: the parent row that scopes access. */
  parent?: { table: string; field: string };
  mode?: TableMode;
  /** Pure link rows that may be physically removed (no evidence value). */
  deletable?: boolean;
  defaultSort?: { field: string; dir: "asc" | "desc" };
}

const N = (field: string, prefix: string, yearly = true) => ({ field, prefix, yearly });

export const TABLE_CONFIG: Record<string, TableConfig> = {
  // ---------------- modules ----------------
  leads: {
    numbering: N("lead_number", "LEAD"),
    serverFields: ["converted_org_id", "converted_at", "mfd_org_id"],
    actionOnlyStatuses: ["converted"],
    labelField: "business_name",
    listColumns: ["lead_number", "business_name", "lead_contact_name", "lead_source", "status", "priority", "assigned_member_id", "next_follow_up_at"],
    searchFields: ["business_name", "lead_contact_name", "email", "lead_number", "city"],
    statusField: "status",
  },
  mfd_organizations: {
    numbering: N("org_code", "MFD", false),
    serverFields: ["source_lead_id"],
    labelField: "legal_name",
    listColumns: ["org_code", "legal_name", "brand_name", "city", "org_status", "account_owner_id", "confidentiality_tier"],
    searchFields: ["legal_name", "brand_name", "org_code", "city", "primary_arn"],
    statusField: "org_status",
    approvalStatuses: ["active"],
  },
  mfd_contacts: {
    labelField: "full_name",
    listColumns: ["full_name", "mfd_org_id", "job_title", "contact_type", "is_primary_contact", "is_decision_maker", "status_active"],
    searchFields: ["full_name", "email", "job_title"],
  },
  sales_opportunities: {
    numbering: N("opportunity_no", "OPP"),
    serverFields: ["closed_at"],
    labelField: "opportunity_name",
    listColumns: ["opportunity_no", "opportunity_name", "mfd_org_id", "service_type", "stage", "expected_value", "owner_member_id", "estimated_close_date"],
    searchFields: ["opportunity_name", "opportunity_no"],
    statusField: "stage",
    approvalStatuses: ["won"],
  },
  consulting_engagements: {
    numbering: N("engagement_code", "ENG"),
    labelField: "engagement_name",
    listColumns: ["engagement_code", "engagement_name", "mfd_org_id", "service_type", "contract_status", "start_date", "end_date", "lead_consultant_id"],
    searchFields: ["engagement_name", "engagement_code"],
    statusField: "contract_status",
    approvalStatuses: ["active"],
  },
  business_profiles: {
    serverFields: ["profile_version", "verified_at"],
    labelField: "as_of_date",
    listColumns: ["mfd_org_id", "as_of_date", "profile_version", "source", "verification_status", "aum_inr", "monthly_sip_book_inr", "active_client_families"],
    searchFields: ["current_crm"],
    statusField: "verification_status",
    approvalStatuses: ["verified"],
    defaultSort: { field: "as_of_date", dir: "desc" },
  },
  assessment_templates: {
    serverFields: ["template_version", "published_at", "published_by"],
    actionOnlyStatuses: ["published"],
    labelField: "template_name",
    listColumns: ["template_code", "template_name", "template_version", "assessment_type", "status", "owner_member_id", "published_at"],
    searchFields: ["template_code", "template_name"],
    statusField: "status",
    approvalStatuses: ["published"],
  },
  assessments: {
    numbering: N("assessment_number", "ASM"),
    serverFields: ["response_count", "completion_pct", "version_snapshot_hash", "submitted_at", "issued_at", "approved_at"],
    actionOnlyStatuses: ["issued", "in_progress", "submitted", "under_review", "approved", "reopened"],
    labelField: "assessment_number",
    listColumns: ["assessment_number", "mfd_org_id", "template_id", "assessment_type", "status", "assigned_consultant_id", "due_at", "completion_pct"],
    searchFields: ["assessment_number"],
    statusField: "status",
    approvalStatuses: ["approved"],
  },
  findings: {
    numbering: N("finding_number", "FND"),
    serverFields: ["accepted_at", "resolved_at"],
    labelField: "title",
    listColumns: ["finding_number", "title", "mfd_org_id", "dimension", "category", "severity", "status", "owner_member_id"],
    searchFields: ["title", "finding_number"],
    statusField: "status",
    approvalStatuses: ["accepted", "resolved"],
  },
  maturity_scorecards: {
    numbering: N("scorecard_number", "SCR"),
    serverFields: ["score_value", "coverage_pct", "evidence_coverage_pct", "calculated_at", "maturity_level"],
    labelField: "scorecard_number",
    listColumns: ["scorecard_number", "mfd_org_id", "scorecard_type", "scorecard_date", "score_value", "maturity_level", "coverage_pct", "status"],
    searchFields: ["scorecard_number"],
    statusField: "status",
    approvalStatuses: ["approved"],
    defaultSort: { field: "scorecard_date", dir: "desc" },
  },
  consulting_sessions: {
    numbering: N("session_number", "SES"),
    serverFields: ["minutes_approved_at"],
    labelField: "title",
    listColumns: ["session_number", "title", "mfd_org_id", "session_type", "status", "starts_at", "organizer_member_id"],
    searchFields: ["title", "session_number"],
    statusField: "status",
    approvalStatuses: ["minutes_approved"],
    defaultSort: { field: "starts_at", dir: "desc" },
  },
  action_tasks: {
    numbering: N("task_number", "TSK"),
    serverFields: ["started_at", "submitted_at", "verified_at", "created_from"],
    labelField: "title",
    listColumns: ["task_number", "title", "mfd_org_id", "status", "priority", "owner_party", "assigned_member_id", "due_at"],
    searchFields: ["title", "task_number"],
    statusField: "status",
    defaultSort: { field: "due_at", dir: "asc" },
  },
  delivery_projects: {
    numbering: N("project_number", "PRJ"),
    serverFields: ["completion_pct"],
    labelField: "project_name",
    listColumns: ["project_number", "project_name", "mfd_org_id", "service_type", "status", "lead_member_id", "end_plan", "completion_pct"],
    searchFields: ["project_name", "project_number"],
    statusField: "status",
    approvalStatuses: ["completed"],
  },
  process_sop_register: {
    serverFields: ["sop_version", "approved_at"],
    labelField: "process_name",
    listColumns: ["process_code", "process_name", "mfd_org_id", "dimension", "status", "sop_version", "adoption_status", "next_review_date"],
    searchFields: ["process_code", "process_name"],
    statusField: "status",
    approvalStatuses: ["approved", "published"],
  },
  training_events: {
    numbering: N("training_number", "TRN"),
    serverFields: ["attendance_total"],
    labelField: "training_title",
    listColumns: ["training_number", "training_title", "mfd_org_id", "mode", "status", "trainer_member_id", "starts_at", "attendance_total"],
    searchFields: ["training_title", "training_number"],
    statusField: "status",
    defaultSort: { field: "starts_at", dir: "desc" },
  },
  decisions: {
    numbering: N("decision_number", "DEC"),
    serverFields: ["decided_at"],
    labelField: "subject",
    listColumns: ["decision_number", "subject", "mfd_org_id", "kind", "status", "requested_by_member_id", "required_by", "decided_at"],
    searchFields: ["subject", "decision_number"],
    statusField: "status",
    approvalStatuses: ["approved", "rejected"],
  },
  media_records: {
    numbering: N("media_number", "MED"),
    serverFields: ["file_object_id"],
    labelField: "media_number",
    listColumns: ["media_number", "mfd_org_id", "session_id", "media_type", "status", "consent_status", "recorded_at"],
    searchFields: ["media_number"],
    statusField: "status",
    approvalStatuses: ["approved"],
  },
  document_records: {
    numbering: N("document_number", "DOC"),
    serverFields: ["current_version", "file_object_id", "received_at", "reviewed_at"],
    labelField: "document_title",
    listColumns: ["document_number", "document_title", "mfd_org_id", "document_category", "status", "classification", "current_version", "request_due_at"],
    searchFields: ["document_title", "document_number"],
    statusField: "status",
    approvalStatuses: ["accepted"],
  },
  communications: {
    numbering: N("communication_number", "COM"),
    labelField: "summary",
    listColumns: ["communication_number", "communicated_at", "mfd_org_id", "channel", "direction", "subject", "status", "follow_up_due_at"],
    searchFields: ["subject", "summary", "communication_number"],
    statusField: "status",
    defaultSort: { field: "communicated_at", dir: "desc" },
  },
  kpi_observations: {
    serverFields: ["revision_number", "supersedes_observation_id"],
    labelField: "period_start",
    listColumns: ["mfd_org_id", "kpi_definition_id", "period_type", "period_start", "period_end", "value_numeric", "unit", "data_quality", "revision_number"],
    searchFields: ["notes"],
    statusField: "data_quality",
    approvalStatuses: ["verified"],
    defaultSort: { field: "period_start", dir: "desc" },
  },
  review_reports: {
    numbering: N("review_number", "REV"),
    serverFields: ["shared_at", "client_acknowledged_at"],
    labelField: "review_number",
    listColumns: ["review_number", "mfd_org_id", "review_type", "period_start", "period_end", "status", "prepared_by_member_id"],
    searchFields: ["review_number", "executive_summary"],
    statusField: "status",
    approvalStatuses: ["approved"],
    defaultSort: { field: "period_start", dir: "desc" },
  },
  improvements: {
    numbering: N("improvement_number", "IMP"),
    serverFields: ["validated_at"],
    labelField: "title",
    listColumns: ["improvement_number", "title", "mfd_org_id", "benefit_type", "status", "attribution_confidence", "validated_at"],
    searchFields: ["title", "improvement_number"],
    statusField: "status",
    approvalStatuses: ["validated"],
  },
  team_members: {
    labelField: "full_name",
    listColumns: ["employee_code", "full_name", "work_email", "job_title", "status", "weekly_capacity_hours", "is_available_for_assignment"],
    searchFields: ["full_name", "work_email", "employee_code"],
    statusField: "status",
  },
  risks_dependencies: {
    numbering: N("risk_number", "RSK"),
    serverFields: ["resolved_at"],
    labelField: "title",
    listColumns: ["risk_number", "title", "mfd_org_id", "risk_type", "severity", "status", "assigned_member_id", "escalation_due_at"],
    searchFields: ["title", "risk_number"],
    statusField: "status",
    approvalStatuses: ["accepted"],
  },
  billing_records: {
    numbering: N("finance_number", "FIN"),
    serverFields: ["amount_total", "amount_received"],
    labelField: "finance_number",
    listColumns: ["finance_number", "mfd_org_id", "record_type", "status", "issued_date", "due_date", "amount_total", "amount_received"],
    searchFields: ["finance_number", "external_invoice_ref"],
    statusField: "status",
    defaultSort: { field: "due_date", dir: "asc" },
  },
  support_requests: {
    numbering: N("ticket_number", "SUP"),
    serverFields: ["opened_at", "resolved_at"],
    labelField: "subject",
    listColumns: ["ticket_number", "subject", "mfd_org_id", "category", "status", "priority", "assigned_member_id", "resolution_due_at"],
    searchFields: ["subject", "ticket_number"],
    statusField: "status",
  },

  // ---------------- support tables ----------------
  workspaces: { permissionTable: "admin", labelField: "name", listColumns: ["slug", "name", "status"], searchFields: ["name"] },
  role_assignments: {
    permissionTable: "admin",
    serverFields: ["assigned_by_user_id"],
    labelField: "role",
    listColumns: ["user_id", "role", "valid_from", "valid_to"],
    searchFields: ["role"],
  },
  client_access_grants: {
    permissionTable: "admin",
    serverFields: ["approved_by_user_id"],
    labelField: "access_role",
    listColumns: ["mfd_org_id", "user_id", "access_role", "is_active", "expires_at", "reason"],
    searchFields: ["reason"],
  },
  mfd_branches: {
    permissionTable: "mfd_organizations",
    labelField: "name",
    listColumns: ["branch_code", "name", "city", "state", "active"],
    searchFields: ["name", "branch_code", "city"],
  },
  mfd_registrations: {
    permissionTable: "mfd_organizations",
    serverFields: ["verified_by_user_id"],
    labelField: "registration_no",
    listColumns: ["registration_type", "registration_no", "verified_at", "valid_from", "valid_to"],
    searchFields: ["registration_no"],
  },
  consent_records: {
    permissionTable: "mfd_contacts",
    serverFields: ["recorded_at"],
    labelField: "purpose",
    listColumns: ["purpose", "person_id", "consent_basis", "is_granted", "granted_at", "withdrawn_at", "notice_version"],
    searchFields: ["purpose"],
    mode: "editable",
  },
  assessment_questions: {
    permissionTable: "assessment_templates",
    parent: { table: "assessment_templates", field: "template_id" },
    serverFields: ["revision"],
    labelField: "question_text",
    listColumns: ["order_no", "question_key", "section_name", "dimension", "question_text", "answer_type", "required", "status"],
    searchFields: ["question_text", "question_key"],
    defaultSort: { field: "order_no", dir: "asc" },
  },
  assessment_answers: {
    permissionTable: "assessments",
    mode: "read-only",
    labelField: "question_id",
    listColumns: ["question_id", "response_state", "submitted_at", "respondent_user_id"],
    searchFields: [],
    defaultSort: { field: "created_at", dir: "asc" },
  },
  assessment_response_events: {
    permissionTable: "assessments",
    parent: { table: "assessment_answers", field: "assessment_answer_id" },
    mode: "read-only",
    labelField: "entity_event",
    listColumns: ["entity_event", "actor_user_id", "occurred_at"],
    searchFields: [],
  },
  scoring_schemes: {
    permissionTable: "assessment_templates",
    serverFields: ["version", "published_at", "published_by_user_id"],
    actionOnlyStatuses: ["published"],
    labelField: "scheme_code",
    listColumns: ["scheme_code", "version", "status", "published_at"],
    searchFields: ["scheme_code"],
    statusField: "status",
    approvalStatuses: ["published"],
  },
  scorecard_dimension_scores: {
    permissionTable: "maturity_scorecards",
    parent: { table: "maturity_scorecards", field: "scorecard_id" },
    mode: "read-only",
    labelField: "dimension",
    listColumns: ["dimension", "answers_eligible", "answers_count", "raw_score", "normalized_score", "coverage_pct", "evidence_count"],
    searchFields: [],
  },
  meeting_attendees: {
    permissionTable: "consulting_sessions",
    parent: { table: "consulting_sessions", field: "session_id" },
    deletable: true,
    labelField: "role",
    listColumns: ["contact_id", "member_id", "role", "attendance_state"],
    searchFields: ["role"],
  },
  transcript_segments: {
    permissionTable: "media_records",
    parent: { table: "media_records", field: "media_record_id" },
    labelField: "text_content",
    listColumns: ["sequence_no", "start_ms", "end_ms", "speaker_label", "text_content", "corrected_text", "human_reviewed_at"],
    searchFields: ["text_content", "corrected_text"],
    defaultSort: { field: "sequence_no", dir: "asc" },
  },
  engagement_staff_assignments: {
    permissionTable: "consulting_engagements",
    parent: { table: "consulting_engagements", field: "engagement_id" },
    serverFields: ["assigned_at"],
    labelField: "responsibility",
    listColumns: ["member_id", "responsibility", "assigned_at", "revoked_at"],
    searchFields: ["responsibility"],
  },
  mfd_departments: {
    permissionTable: "mfd_organizations",
    labelField: "department_name",
    listColumns: ["department_name", "branch_id", "head_contact_id", "headcount", "active"],
    searchFields: ["department_name"],
  },
  task_dependencies: {
    permissionTable: "action_tasks",
    parent: { table: "action_tasks", field: "task_id" },
    deletable: true,
    labelField: "dependency_type",
    listColumns: ["depends_on_task_id", "dependency_type"],
    searchFields: [],
  },
  project_milestones: {
    permissionTable: "delivery_projects",
    parent: { table: "delivery_projects", field: "project_id" },
    serverFields: ["verified_at"],
    labelField: "title",
    listColumns: ["title", "status", "planned_due_at", "actual_done_at", "verified_by_member_id"],
    searchFields: ["title"],
    statusField: "status",
    defaultSort: { field: "planned_due_at", dir: "asc" },
  },
  sop_versions: {
    permissionTable: "process_sop_register",
    parent: { table: "process_sop_register", field: "sop_id" },
    mode: "append-only",
    serverFields: ["version_no"],
    labelField: "version_no",
    listColumns: ["version_no", "document_id", "status", "approved_by_contact_id", "approved_at", "change_summary"],
    searchFields: [],
    defaultSort: { field: "version_no", dir: "desc" },
  },
  training_attendance: {
    permissionTable: "training_events",
    parent: { table: "training_events", field: "training_id" },
    labelField: "attendance_state",
    listColumns: ["contact_id", "attendance_state", "feedback_score", "quiz_score", "adoption_check_at"],
    searchFields: [],
  },
  decision_approvals: {
    permissionTable: "decisions",
    parent: { table: "decisions", field: "decision_id" },
    serverFields: ["actioned_at"],
    labelField: "status",
    listColumns: ["actor_type", "approver_contact_id", "approver_member_id", "status", "actioned_at", "comment"],
    searchFields: [],
  },
  file_objects: {
    permissionTable: "document_records",
    mode: "read-only",
    labelField: "original_filename",
    listColumns: ["original_filename", "mime_type", "size_bytes", "scan_status", "created_at"],
    searchFields: ["original_filename"],
  },
  document_versions: {
    permissionTable: "document_records",
    parent: { table: "document_records", field: "document_id" },
    mode: "read-only",
    labelField: "version_no",
    listColumns: ["version_no", "file_object_id", "uploaded_at", "uploaded_by_user_id", "change_note"],
    searchFields: [],
    defaultSort: { field: "version_no", dir: "desc" },
  },
  document_links: {
    permissionTable: "document_records",
    parent: { table: "document_records", field: "document_id" },
    serverFields: ["linked_at", "linked_by_user_id"],
    deletable: true,
    labelField: "entity_type",
    listColumns: ["entity_type", "entity_id", "linked_at"],
    searchFields: [],
  },
  communication_participants: {
    permissionTable: "communications",
    parent: { table: "communications", field: "communication_id" },
    deletable: true,
    labelField: "participant_role",
    listColumns: ["contact_id", "member_id", "participant_role"],
    searchFields: [],
  },
  kpi_definitions: {
    permissionTable: "kpi_observations",
    mode: "append-only",
    serverFields: ["version"],
    labelField: "name",
    listColumns: ["metric_code", "version", "name", "unit", "aggregation_rule", "active_from"],
    searchFields: ["metric_code", "name"],
  },
  payment_allocations: {
    permissionTable: "billing_records",
    parent: { table: "billing_records", field: "billing_record_id" },
    mode: "append-only",
    labelField: "payment_reference",
    listColumns: ["payment_reference", "amount", "received_at", "source_system"],
    searchFields: ["payment_reference"],
  },
  approval_audit_events: {
    permissionTable: "audit",
    mode: "read-only",
    labelField: "new_state",
    listColumns: ["entity_type", "entity_id", "old_state", "new_state", "actor_user_id", "event_at"],
    searchFields: [],
    defaultSort: { field: "event_at", dir: "desc" },
  },
  audit_events: {
    permissionTable: "audit",
    mode: "read-only",
    labelField: "action",
    listColumns: ["recorded_at", "entity_table", "entity_id", "action", "user_id", "ip_class"],
    searchFields: ["entity_table", "action"],
    defaultSort: { field: "recorded_at", dir: "desc" },
  },
  outbox_events: {
    permissionTable: "admin",
    mode: "read-only",
    labelField: "event_type",
    listColumns: ["event_type", "aggregate_id", "state", "retry_count", "published_at", "created_at"],
    searchFields: ["event_type"],
    defaultSort: { field: "created_at", dir: "desc" },
  },
  notification_deliveries: {
    permissionTable: "admin",
    mode: "read-only",
    labelField: "template_code",
    listColumns: ["recipient_user_id", "template_code", "channel", "state", "attempted_at"],
    searchFields: ["template_code"],
    defaultSort: { field: "created_at", dir: "desc" },
  },
  retention_holds: {
    permissionTable: "admin",
    serverFields: ["placed_at", "placed_by_user_id", "released_at"],
    labelField: "reason",
    listColumns: ["mfd_org_id", "entity_type", "entity_id", "status", "placed_at", "released_at", "reason"],
    searchFields: ["reason", "entity_type"],
    statusField: "status",
  },
};

export function tableConfig(table: string): TableConfig {
  const c = TABLE_CONFIG[table];
  if (!c) throw new Error(`No config for ${table}`);
  return c;
}

/** Child panels shown on a module record's detail page. */
export const CHILD_TABLES: Record<string, { table: string; field: string; label: string }[]> = {
  mfd_organizations: [
    { table: "mfd_branches", field: "mfd_org_id", label: "Branches" },
    { table: "mfd_registrations", field: "mfd_org_id", label: "Registrations (ARN/EUIN)" },
    { table: "mfd_departments", field: "mfd_org_id", label: "Departments" },
    { table: "consent_records", field: "mfd_org_id", label: "Consent records" },
    { table: "client_access_grants", field: "mfd_org_id", label: "Access grants" },
  ],
  consulting_engagements: [{ table: "engagement_staff_assignments", field: "engagement_id", label: "Engagement team" }],
  assessment_templates: [{ table: "assessment_questions", field: "template_id", label: "Question bank" }],
  maturity_scorecards: [{ table: "scorecard_dimension_scores", field: "scorecard_id", label: "Dimension scores" }],
  consulting_sessions: [{ table: "meeting_attendees", field: "session_id", label: "Attendees" }],
  action_tasks: [{ table: "task_dependencies", field: "task_id", label: "Dependencies" }],
  delivery_projects: [{ table: "project_milestones", field: "project_id", label: "Milestones" }],
  process_sop_register: [{ table: "sop_versions", field: "sop_id", label: "SOP versions" }],
  training_events: [{ table: "training_attendance", field: "training_id", label: "Attendance" }],
  decisions: [{ table: "decision_approvals", field: "decision_id", label: "Approvals" }],
  media_records: [{ table: "transcript_segments", field: "media_record_id", label: "Transcript" }],
  document_records: [
    { table: "document_versions", field: "document_id", label: "Versions" },
    { table: "document_links", field: "document_id", label: "Linked records" },
  ],
  communications: [{ table: "communication_participants", field: "communication_id", label: "Participants" }],
  billing_records: [{ table: "payment_allocations", field: "billing_record_id", label: "Payments" }],
};
