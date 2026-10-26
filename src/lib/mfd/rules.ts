/**
 * Module invariants from the spec's Validation Rules sheet (rule IDs in
 * comments), plus derived/server-set fields. The generic engine calls, in
 * order: prepare (derive), validate (reject), then after the write:
 * afterWrite (recompute parents) and events (automation outbox).
 */
import { isAdminActor, type Actor } from "./access";
import { countRecs, delegate, findRecs, getRec, type Tx } from "./store";
import { dec, type Rec } from "./values";

export interface RuleCtx {
  actor: Actor;
  tx: Tx;
  table: string;
  op: "create" | "update";
  prev: Rec | null;
  /** The full record after this write (mutable in prepare). */
  next: Rec;
}

export interface OutboxSpec {
  type: string;
  /** Unique per workspace — duplicates are dropped (GV-11). */
  key: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
}

export interface TableRules {
  prepare?(ctx: RuleCtx): void | Promise<void>;
  validate?(ctx: RuleCtx): string[] | Promise<string[]>;
  afterWrite?(ctx: RuleCtx & { id: string }): void | Promise<void>;
  events?(ctx: RuleCtx & { id: string }): OutboxSpec[];
}

const nowIso = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);
const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim());

/** The field moved into one of `values` with this write (or was created with it). */
export function entering(ctx: RuleCtx, field: string, values: string[]) {
  const v = ctx.next[field] as string | null;
  return !!v && values.includes(v) && ctx.prev?.[field] !== v;
}

const changed = (ctx: RuleCtx, field: string) => ctx.prev !== null && ctx.prev[field] !== ctx.next[field];

async function doc(ctx: RuleCtx, id: unknown) {
  return id ? getRec(ctx.tx, "document_records", String(id), ctx.actor.workspaceId) : null;
}

async function fileClean(ctx: RuleCtx, fileId: unknown) {
  if (!fileId) return false;
  const f = await getRec(ctx.tx, "file_objects", String(fileId), ctx.actor.workspaceId);
  return f?.scan_status === "clean";
}

async function member(ctx: RuleCtx, id: unknown) {
  return id ? getRec(ctx.tx, "team_members", String(id), ctx.actor.workspaceId) : null;
}

/** Whether a team member's login can reach this MFD (grant, or a workspace-wide role). */
export async function memberCanAccessOrg(tx: Tx, workspaceId: string, memberId: string, orgId: string) {
  const m = await getRec(tx, "team_members", memberId, workspaceId);
  if (!m) return false;
  const userId = m.auth_user_id as string;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!user?.isActive) return false;
  if (user.role === "SUPER_ADMIN" || user.role === "ADMIN") return true;
  const now = new Date();
  const wide = await tx.ccRoleAssignment.count({
    where: {
      workspaceId,
      userId,
      role: { in: ["platform_admin", "aina_admin", "director"] },
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
  });
  if (wide > 0) return true;
  const grant = await tx.ccClientAccessGrant.count({
    where: { workspaceId, userId, mfdOrgId: orgId, isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
  return grant > 0;
}

// ---------------------------------------------------------------- modules

const leads: TableRules = {
  validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (blank(n.email) && blank(n.mobile_e164)) e.push("LEAD-01: Either email or phone required.");
    if (n.status === "unqualified" && blank(n.unqualified_reason)) e.push("LEAD-02: An unqualified lead needs a reason.");
    if ((n.status === "qualified" || n.status === "converted") && blank(n.assigned_member_id)) {
      e.push("A qualified lead must be assigned to a team member.");
    }
    if (ctx.prev?.status === "converted" && changed(ctx, "status")) e.push("LEAD-03: A converted lead can't change status.");
    return e;
  },
  events(ctx) {
    return entering(ctx, "status", ["qualified"])
      ? [{ type: "lead.qualified", key: `lead.qualified:${ctx.id}`, aggregateId: ctx.id }]
      : [];
  },
};

const mfdOrganizations: TableRules = {
  validate(ctx) {
    const e: string[] = [];
    if (ctx.next.org_status === "active" && blank(ctx.next.account_owner_id)) e.push("MFD-03: An active organization needs an internal account owner.");
    return e;
  },
};

const mfdContacts: TableRules = {
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (n.status_active && blank(n.email) && blank(n.mobile_e164)) e.push("CON-01: An active contact needs an email or mobile number.");
    if (n.joined_at && n.left_at && (n.left_at as string) < (n.joined_at as string)) e.push("Left date can't be before joined date.");
    if (n.is_primary_contact && n.status_active) {
      const others = await delegate(ctx.tx, "mfd_contacts").count({
        where: {
          workspaceId: ctx.actor.workspaceId,
          mfdOrgId: n.mfd_org_id,
          isPrimaryContact: true,
          statusActive: true,
          archivedAt: null,
          ...(n.id ? { id: { not: n.id } } : {}),
        },
      });
      if (others > 0) e.push("CON-02: This MFD already has an active primary contact.");
    }
    return e;
  },
};

const salesOpportunities: TableRules = {
  prepare(ctx) {
    if (entering(ctx, "stage", ["won", "lost"])) ctx.next.closed_at = nowIso();
    else if (ctx.prev && !["won", "lost"].includes(ctx.next.stage as string)) ctx.next.closed_at = null;
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (blank(n.lead_id) && blank(n.mfd_org_id)) e.push("OPP-01: A lead or an MFD organization is required.");
    if (n.stage === "won") {
      if (blank(n.mfd_org_id)) e.push("OPP-01: A won deal must be linked to an MFD organization.");
      const proposal = await doc(ctx, n.proposal_document_id);
      if (proposal?.status !== "accepted") e.push("OPP-01: A won deal needs an accepted proposal document as acceptance evidence.");
    }
    if (n.stage === "lost" && blank(n.loss_reason)) e.push("OPP-03: A lost deal needs a loss reason.");
    return e;
  },
  events(ctx) {
    return entering(ctx, "stage", ["won"]) ? [{ type: "opportunity.won", key: `opportunity.won:${ctx.id}`, aggregateId: ctx.id }] : [];
  },
};

const consultingEngagements: TableRules = {
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (n.start_date && n.end_date && (n.end_date as string) < (n.start_date as string)) e.push("ENG-01: End date must be on or after the start date.");
    if (n.contract_status === "active") {
      const contract = await doc(ctx, n.contract_document_id);
      if (contract?.status !== "accepted") e.push("ENG-02: Activation needs an accepted contract document.");
      if (blank(n.client_sponsor_contact_id)) e.push("ENG-03: Activation needs a client sponsor.");
    }
    if (n.lead_consultant_id && (ctx.op === "create" || changed(ctx, "lead_consultant_id"))) {
      const ok = await memberCanAccessOrg(ctx.tx, ctx.actor.workspaceId, n.lead_consultant_id as string, n.mfd_org_id as string);
      if (!ok) e.push("The lead consultant must have access to this MFD (grant them access first).");
    }
    return e;
  },
  events(ctx) {
    return entering(ctx, "contract_status", ["active"])
      ? [{ type: "engagement.activated", key: `engagement.activated:${ctx.id}`, aggregateId: ctx.id }]
      : [];
  },
};

const businessProfiles: TableRules = {
  async prepare(ctx) {
    if (ctx.op === "create") {
      const rows = await delegate(ctx.tx, "business_profiles").findMany({
        where: { workspaceId: ctx.actor.workspaceId, mfdOrgId: ctx.next.mfd_org_id, asOfDate: new Date(`${ctx.next.as_of_date as string}T00:00:00.000Z`) },
        select: { profileVersion: true },
      });
      ctx.next.profile_version = rows.reduce((m, r) => Math.max(m, r.profileVersion as number), 0) + 1;
    }
    if (entering(ctx, "verification_status", ["verified"])) ctx.next.verified_at = nowIso();
  },
  validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (ctx.prev?.verification_status === "verified") e.push("BAS-01: A verified baseline is append-only — record a new as-of snapshot instead.");
    if (n.verification_status === "verified") {
      if (blank(n.verified_by)) e.push("BAS-02: Verified requires a reviewer.");
      if (blank(n.source_document_id)) e.push("BAS-02: Verified requires a source/evidence document.");
      if ((n.as_of_date as string) > todayKey()) e.push("A verified baseline can't be future-dated.");
    }
    return e;
  },
};

const assessmentTemplates: TableRules = {
  async prepare(ctx) {
    // A template code's versions count up; "new version" is just another create with the same code.
    if (ctx.op === "create") {
      const rows = await delegate(ctx.tx, "assessment_templates").findMany({
        where: { workspaceId: ctx.actor.workspaceId, templateCode: ctx.next.template_code },
        select: { templateVersion: true },
      });
      ctx.next.template_version = rows.reduce((m, r) => Math.max(m, r.templateVersion as number), 0) + 1;
    }
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (ctx.prev?.status === "published") {
      const allowed = new Set(["status", "updated_at", "updated_by_user_id", "row_version"]);
      const changes = Object.keys(n).filter((k) => !allowed.has(k) && JSON.stringify(n[k]) !== JSON.stringify(ctx.prev![k]));
      if (changes.length || (n.status !== "published" && n.status !== "retired")) {
        e.push("TMP-01: A published template is immutable — create a new version instead (it can only be retired).");
      }
    }
    if (n.is_client_specific && blank(n.mfd_org_id)) e.push("TMP-03: A client-specific template needs its MFD organization.");
    if (!n.is_client_specific && !blank(n.mfd_org_id)) e.push("Only a client-specific template can be tied to an MFD.");
    if (!blank(n.scoring_scheme_code)) {
      const scheme = await delegate(ctx.tx, "scoring_schemes").count({
        where: {
          workspaceId: ctx.actor.workspaceId,
          schemeCode: n.scoring_scheme_code,
          status: "published",
          ...(n.scoring_scheme_version ? { version: n.scoring_scheme_version } : {}),
        },
      });
      if (!scheme) e.push("The scoring scheme must exist and be published.");
    }
    return e;
  },
};

const assessments: TableRules = {
  async prepare(ctx) {
    if (ctx.op === "create") {
      const tpl = await getRec(ctx.tx, "assessment_templates", ctx.next.template_id as string, ctx.actor.workspaceId);
      if (tpl && blank(ctx.next.assessment_type)) ctx.next.assessment_type = tpl.assessment_type;
      ctx.next.response_count = 0;
      ctx.next.completion_pct = "0.00";
      ctx.next.status ??= "draft";
    }
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (ctx.op === "create" || changed(ctx, "template_id")) {
      if (ctx.prev && ctx.prev.status !== "draft") e.push("The template can't change after the assessment is issued.");
      const tpl = await getRec(ctx.tx, "assessment_templates", n.template_id as string, ctx.actor.workspaceId);
      if (tpl?.status !== "published") e.push("ASM-01: Only a published template version can be used.");
      if (tpl?.is_client_specific && tpl.mfd_org_id !== n.mfd_org_id) e.push("That template belongs to a different MFD.");
    }
    if (n.assessment_mode === "self_assessment" && blank(n.assigned_contact_id)) e.push("A self-assessment needs the client contact who will respond.");
    if (n.issued_at && n.due_at && (n.due_at as string) < (n.issued_at as string)) e.push("Due date can't be before the issue date.");
    return e;
  },
  events(ctx) {
    const out: OutboxSpec[] = [];
    for (const s of ["issued", "submitted", "approved"]) {
      if (entering(ctx, "status", [s])) out.push({ type: `assessment.${s}`, key: `assessment.${s}:${ctx.id}:${ctx.next.row_version}`, aggregateId: ctx.id });
    }
    return out;
  },
};

const findings: TableRules = {
  prepare(ctx) {
    if (entering(ctx, "status", ["accepted"])) ctx.next.accepted_at = nowIso();
    if (entering(ctx, "status", ["resolved"])) ctx.next.resolved_at = nowIso();
  },
  validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (blank(n.assessment_id) && blank(n.session_id) && blank(n.source_description)) {
      e.push("FND-01: Link an assessment or session, or describe the source.");
    }
    if (entering(ctx, "status", ["resolved"]) && (ctx.prev?.status !== "verification" || !n.evidence_verified)) {
      e.push("FND-02: A finding is resolved only from Verification, with its evidence verified.");
    }
    if (
      ["high", "critical"].includes(n.severity as string) &&
      entering(ctx, "status", ["accepted", "resolved"]) &&
      !isAdminActor(ctx.actor) &&
      !ctx.actor.roles.has("consulting_head")
    ) {
      e.push("FND-03: A high/critical finding must be reviewed by the Consulting Head.");
    }
    return e;
  },
  events(ctx) {
    return entering(ctx, "status", ["accepted"]) ? [{ type: "finding.accepted", key: `finding.accepted:${ctx.id}`, aggregateId: ctx.id }] : [];
  },
};

const maturityScorecards: TableRules = {
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (ctx.op === "create" || changed(ctx, "scoring_scheme_code") || changed(ctx, "scoring_scheme_version")) {
      const scheme = await delegate(ctx.tx, "scoring_schemes").count({
        where: { workspaceId: ctx.actor.workspaceId, schemeCode: n.scoring_scheme_code, version: n.scoring_scheme_version, status: "published" },
      });
      if (!scheme) e.push("SCR-01: Scorecards are calculated under a published scoring scheme version.");
    }
    if (ctx.prev?.status === "approved" && Object.keys(n).some((k) => !["status", "updated_at", "updated_by_user_id", "row_version"].includes(k) && JSON.stringify(n[k]) !== JSON.stringify(ctx.prev![k]))) {
      e.push("An approved scorecard is fixed — supersede it with a new one.");
    }
    if (entering(ctx, "status", ["approved"])) {
      if (blank(n.calculated_at)) e.push("SCR-03: Calculate the scorecard before approving it.");
      const approver = await member(ctx, n.approved_by);
      if (!approver) e.push("SCR-03: Approval needs an approver.");
      else if (approver.auth_user_id === n.created_by_user_id) e.push("SCR-03: Approval must be independent of whoever prepared the scorecard.");
    }
    return e;
  },
};

const consultingSessions: TableRules = {
  prepare(ctx) {
    if (entering(ctx, "status", ["minutes_approved"])) ctx.next.minutes_approved_at = nowIso();
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (n.ends_at && (n.ends_at as string) <= (n.starts_at as string)) e.push("SES-01: End must be after start.");
    if (n.recording_expected) {
      const consent = n.consent_record_id ? await getRec(ctx.tx, "consent_records", n.consent_record_id as string, ctx.actor.workspaceId) : null;
      if (!consent || !consent.is_granted || consent.withdrawn_at) e.push("SES-02: Recording needs a granted, current consent record.");
    }
    if (entering(ctx, "status", ["minutes_approved"]) && blank(n.client_approved_minutes)) {
      e.push("SES-03: Add the client-approved minutes before approving them.");
    }
    return e;
  },
  events(ctx) {
    return entering(ctx, "status", ["completed"]) ? [{ type: "session.completed", key: `session.completed:${ctx.id}`, aggregateId: ctx.id }] : [];
  },
};

const actionTasks: TableRules = {
  prepare(ctx) {
    if (ctx.op === "create") ctx.next.created_from ??= "manual";
    if (entering(ctx, "status", ["in_progress"]) && blank(ctx.next.started_at)) ctx.next.started_at = nowIso();
    if (entering(ctx, "status", ["submitted_for_review"])) ctx.next.submitted_at = nowIso();
    if (entering(ctx, "status", ["completed"])) ctx.next.verified_at = nowIso();
  },
  validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    const party = n.owner_party as string;
    if ((party === "aina" || party === "shared") && blank(n.assigned_member_id)) e.push("TSK-01: Assign an Aina team member.");
    if ((party === "mfd" || party === "shared") && blank(n.assigned_contact_id)) e.push("TSK-01: Assign the responsible MFD contact.");
    if (["submitted_for_review", "verification", "completed"].includes(n.status as string) && blank(n.acceptance_criteria)) {
      e.push("TSK-02: Set acceptance criteria before submitting for verification.");
    }
    if (entering(ctx, "status", ["completed"])) {
      if (!["submitted_for_review", "verification"].includes((ctx.prev?.status as string) ?? "")) {
        e.push("TSK-02: A task is completed from review/verification, not directly.");
      }
      if (blank(n.verified_by)) e.push("TSK-02: Completion needs a verifier.");
      else if (n.verified_by === n.assigned_member_id) e.push("TSK-02: The verifier must be someone other than the assignee.");
      if (blank(n.completion_notes)) e.push("TSK-02: Record the completion evidence in completion notes.");
    }
    if (n.status === "blocked" && blank(n.block_reason)) e.push("TSK-03: A blocked task needs a reason.");
    return e;
  },
};

async function recomputeProjectCompletion(tx: Tx, workspaceId: string, projectId: string) {
  const ms = await findRecs(tx, "project_milestones", { project_id: projectId });
  const active = ms.filter((m) => m.status !== "cancelled");
  const pct = active.length ? (active.filter((m) => m.status === "verified").length / active.length) * 100 : 0;
  await delegate(tx, "delivery_projects").updateMany({ where: { id: projectId, workspaceId }, data: { completionPct: pct.toFixed(2) } });
}

const deliveryProjects: TableRules = {
  prepare(ctx) {
    if (ctx.op === "create") ctx.next.completion_pct = "0.00";
  },
  validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (n.start_plan && n.end_plan && (n.end_plan as string) < (n.start_plan as string)) e.push("Planned end can't be before planned start.");
    if (n.start_actual && n.end_actual && (n.end_actual as string) < (n.start_actual as string)) e.push("Actual end can't be before actual start.");
    if (["uat", "completed"].includes(n.status as string) && blank(n.acceptance_criteria)) e.push("Set acceptance criteria before UAT or completion.");
    if (n.status === "completed" && blank(n.client_acceptance_at)) e.push("PRJ-03: Completion needs the client's sign-off date.");
    return e;
  },
};

const processSop: TableRules = {
  prepare(ctx) {
    if (ctx.op === "create") ctx.next.sop_version = 1;
    if (entering(ctx, "status", ["approved", "published"]) && blank(ctx.next.approved_at)) ctx.next.approved_at = nowIso();
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (ctx.op === "create" || changed(ctx, "process_code")) {
      const dup = await delegate(ctx.tx, "process_sop_register").count({
        where: { workspaceId: ctx.actor.workspaceId, mfdOrgId: n.mfd_org_id, processCode: n.process_code, archivedAt: null, ...(n.id ? { id: { not: n.id } } : {}) },
      });
      if (dup) e.push("SOP-01: This process code is already in use for the MFD.");
    }
    if (n.status === "published") {
      if (blank(n.approved_by_contact_id)) e.push("SOP-02: Publishing needs the client approver.");
      const versions = await countRecs(ctx.tx, "sop_versions", { sop_id: n.id ?? "__new__" });
      if (!versions) e.push("SOP-02: Add an SOP version (with its document) before publishing.");
    }
    if (entering(ctx, "adoption_status", ["verified"])) {
      if (n.status !== "published") e.push("SOP-03: Only a published SOP can have verified adoption.");
      const evidence = await delegate(ctx.tx, "training_events").count({
        where: { workspaceId: ctx.actor.workspaceId, mfdOrgId: n.mfd_org_id, adoptionVerifiedAt: { not: null }, archivedAt: null },
      });
      if (!evidence) e.push("SOP-03: Verified adoption needs a training adoption check showing staff usage.");
    }
    return e;
  },
  events(ctx) {
    return entering(ctx, "status", ["published"])
      ? [{ type: "sop.published", key: `sop.published:${ctx.id}:${ctx.next.sop_version}`, aggregateId: ctx.id }]
      : [];
  },
};

async function recomputeAttendance(tx: Tx, workspaceId: string, trainingId: string) {
  const n = await delegate(tx, "training_attendance").count({ where: { trainingId, attendanceState: { in: ["attended", "partial"] } } });
  await delegate(tx, "training_events").updateMany({ where: { id: trainingId, workspaceId }, data: { attendanceTotal: n } });
}

const trainingEvents: TableRules = {
  prepare(ctx) {
    if (ctx.op === "create") ctx.next.attendance_total = 0;
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (n.ends_at && (n.ends_at as string) <= (n.starts_at as string)) e.push("TRN-01: End must be after start.");
    if (!blank(n.adoption_verified_at) && (ctx.op === "create" || changed(ctx, "adoption_verified_at"))) {
      const checks = await delegate(ctx.tx, "training_attendance").count({ where: { trainingId: n.id ?? "__new__", adoptionCheckAt: { not: null } } });
      if (!checks) e.push("TRN-03: Record an adoption check on at least one attendee first.");
    }
    return e;
  },
  events(ctx) {
    return entering(ctx, "status", ["completed"]) ? [{ type: "training.completed", key: `training.completed:${ctx.id}`, aggregateId: ctx.id }] : [];
  },
};

const decisions: TableRules = {
  prepare(ctx) {
    if (entering(ctx, "status", ["approved", "rejected"])) ctx.next.decided_at = nowIso();
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (["approved", "rejected"].includes(n.status as string) && blank(n.final_resolution)) e.push("DEC-01: Record the final resolution.");
    if (entering(ctx, "status", ["approved"]) && !blank(n.decision_owner_contact_id)) {
      const approvals = await delegate(ctx.tx, "decision_approvals").count({
        where: { decisionId: n.id ?? "__new__", approverContactId: n.decision_owner_contact_id, status: "approved" },
      });
      if (!approvals && blank(n.evidence_document_id)) {
        e.push("DEC-02: A client decision needs the decision owner's recorded approval or written evidence.");
      }
    }
    return e;
  },
  events(ctx) {
    return entering(ctx, "status", ["approved"]) ? [{ type: "decision.approved", key: `decision.approved:${ctx.id}`, aggregateId: ctx.id }] : [];
  },
};

const mediaRecords: TableRules = {
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    const processing = ["processing", "draft_transcript", "human_review", "approved"].includes(n.status as string);
    if (["audio", "video"].includes(n.media_type as string) && processing && !(await fileClean(ctx, n.file_object_id))) {
      e.push("MED-01: Audio/video needs an uploaded, scanned-clean file before processing.");
    }
    if (n.consent_status !== "not_required" && blank(n.consent_record_id) && n.media_type !== "transcript") {
      e.push("MED-02: Link the consent record (or mark consent as not required).");
    }
    if ((processing || n.ai_processing_allowed) && n.consent_status !== "granted" && n.consent_status !== "not_required") {
      e.push("MED-02: Processing needs consent to be granted.");
    }
    if (n.ai_processing_allowed && n.consent_status !== "granted") e.push("MED-02: AI processing needs granted, purpose-specific consent.");
    if (entering(ctx, "status", ["approved"]) && (!n.transcript_quality_reviewed || blank(n.transcript_document_id))) {
      e.push("MED-03: An approved transcript needs human review and its transcript document.");
    }
    return e;
  },
  events(ctx) {
    const f = ctx.next.file_object_id as string | null;
    return f && ctx.prev?.file_object_id !== f ? [{ type: "media.uploaded", key: `media.uploaded:${ctx.id}:${f}`, aggregateId: ctx.id }] : [];
  },
};

const documentRecords: TableRules = {
  prepare(ctx) {
    if (ctx.op === "create") ctx.next.current_version = 0;
    if (entering(ctx, "status", ["accepted", "rejected"])) ctx.next.reviewed_at = nowIso();
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (["received", "under_review", "accepted"].includes(n.status as string) && !(await fileClean(ctx, n.file_object_id))) {
      e.push("DOC-01: Upload a file (scanned clean) before marking the document received or accepted.");
    }
    if (n.status === "rejected" && blank(n.rejection_reason)) e.push("DOC-03: A rejected document needs a reason.");
    if (n.status === "accepted" && blank(n.reviewed_by)) e.push("DOC-03: An accepted document needs a reviewer.");
    return e;
  },
};

const kpiObservations: TableRules = {
  prepare(ctx) {
    if (ctx.op === "create") ctx.next.revision_number ??= 1;
    if (entering(ctx, "data_quality", ["verified"])) ctx.next.verified_at = nowIso();
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    const def = await getRec(ctx.tx, "kpi_definitions", n.kpi_definition_id as string, ctx.actor.workspaceId);
    if (def && def.unit !== n.unit) e.push(`KPI-01: This metric is measured in ${def.unit as string}.`);
    if ((n.period_end as string) <= (n.period_start as string)) e.push("KPI-02: Period end (exclusive) must be after the start.");
    if (ctx.prev) {
      for (const f of ["value_numeric", "period_start", "period_end", "unit", "kpi_definition_id"]) {
        if (changed(ctx, f)) e.push("KPI-02: Observations are not overwritten — post a correction instead.");
      }
    }
    if (n.data_quality === "verified") {
      if (blank(n.verified_by) || blank(n.source_document_id)) e.push("KPI-03: Verified needs a reviewer and source evidence.");
      else if (n.verified_by === n.entered_by) e.push("KPI-03: Verification must be independent of who entered it.");
    }
    return [...new Set(e)];
  },
  events(ctx) {
    return ctx.op === "create" && ctx.next.supersedes_observation_id
      ? [{ type: "kpi.corrected", key: `kpi.corrected:${ctx.id}`, aggregateId: ctx.id, payload: { supersedes: ctx.next.supersedes_observation_id } }]
      : [];
  },
};

const reviewReports: TableRules = {
  prepare(ctx) {
    if (entering(ctx, "status", ["client_shared"])) ctx.next.shared_at = nowIso();
    if (entering(ctx, "status", ["acknowledged"])) ctx.next.client_acknowledged_at = nowIso();
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if ((n.period_end as string) <= (n.period_start as string)) e.push("REV-01: Period end (exclusive) must be after the start.");
    if (["client_shared", "acknowledged"].includes(n.status as string)) {
      const report = await doc(ctx, n.report_document_id);
      if (report?.status !== "accepted") e.push("REV-02: Share only with an approved (accepted) report document.");
    }
    if (n.status === "acknowledged") {
      const approver = n.client_approver_contact_id
        ? await getRec(ctx.tx, "mfd_contacts", n.client_approver_contact_id as string, ctx.actor.workspaceId)
        : null;
      if (!approver?.is_approver) e.push("REV-03: Acknowledgement must come from an authorized client approver.");
    }
    return e;
  },
};

const improvements: TableRules = {
  prepare(ctx) {
    if (entering(ctx, "status", ["validated"])) ctx.next.validated_at = nowIso();
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    const base = n.baseline_kpi_observation_id ? await getRec(ctx.tx, "kpi_observations", n.baseline_kpi_observation_id as string, ctx.actor.workspaceId) : null;
    const res = n.result_kpi_observation_id ? await getRec(ctx.tx, "kpi_observations", n.result_kpi_observation_id as string, ctx.actor.workspaceId) : null;
    if (base && res) {
      if (base.kpi_definition_id !== res.kpi_definition_id || base.unit !== res.unit || base.branch_id !== res.branch_id) {
        e.push("IMP-01: Baseline and result must use the same KPI definition, unit and scope.");
      } else if ((res.period_start as string) < (base.period_end as string)) {
        e.push("IMP-01: The result period must come after the baseline period.");
      }
    }
    const comparable = !!base && !!res;
    if (n.status === "validated") {
      if (blank(n.validated_by) || blank(n.evidence_document_id)) e.push("IMP-02: Validation needs a verifier and evidence.");
      if (!comparable) e.push("AT-16: Without comparable baseline and result KPIs a benefit stays hypothesis/observed.");
    }
    if (["moderate", "strong"].includes(n.attribution_confidence as string) && (!comparable || blank(n.evidence_document_id))) {
      e.push("IMP-03: Moderate/strong attribution needs comparable KPIs and evidence.");
    }
    return e;
  },
};

const teamMembers: TableRules = {
  prepare(ctx) {
    if (typeof ctx.next.work_email === "string") ctx.next.work_email = ctx.next.work_email.toLowerCase();
    if (["suspended", "departed"].includes(ctx.next.status as string)) ctx.next.is_available_for_assignment = false;
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (n.joined_at && n.separated_at && (n.separated_at as string) < (n.joined_at as string)) e.push("Separation can't be before joining.");
    if (n.manager_member_id) {
      if (n.manager_member_id === n.id) e.push("TEAM-02: A member can't manage themselves.");
      let cursor = n.manager_member_id as string | null;
      for (let i = 0; cursor && i < 50; i++) {
        if (cursor === n.id) {
          e.push("TEAM-02: That would create a reporting cycle.");
          break;
        }
        const m: { managerMemberId: string | null } | null = await ctx.tx.ccTeamMember.findUnique({ where: { id: cursor }, select: { managerMemberId: true } });
        cursor = m?.managerMemberId ?? null;
      }
    }
    return e;
  },
};

const risks: TableRules = {
  prepare(ctx) {
    if (entering(ctx, "status", ["resolved", "closed"])) ctx.next.resolved_at = nowIso();
    if (ctx.next.severity === "critical" && blank(ctx.next.escalation_due_at)) ctx.next.escalation_due_at = nowIso();
  },
  validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (n.risk_type !== "risk" && !blank(n.probability_pct)) e.push("RSK-01: Probability applies only to future risks, not issues/dependencies/blockers.");
    if (entering(ctx, "status", ["resolved"]) && blank(n.mitigation_plan)) e.push("RSK-02: Record the resolution evidence in the mitigation plan.");
    return e;
  },
  events(ctx) {
    return ctx.next.severity === "critical" && (ctx.op === "create" || changed(ctx, "severity"))
      ? [{ type: "risk.critical", key: `risk.critical:${ctx.id}:${ctx.next.row_version}`, aggregateId: ctx.id }]
      : [];
  },
};

async function recomputeBilling(tx: Tx, workspaceId: string, billingId: string) {
  const bill = await getRec(tx, "billing_records", billingId, workspaceId);
  if (!bill) return;
  const allocs = await findRecs(tx, "payment_allocations", { billing_record_id: billingId });
  const received = dec.add(...allocs.map((a) => a.amount as string));
  const total = dec.of(bill.amount_total as string);
  let status = bill.status as string;
  if (received.gt(0) && total.gt(0)) status = received.gte(total) ? "paid" : "part_paid";
  await delegate(tx, "billing_records").updateMany({
    where: { id: billingId, workspaceId },
    data: { amountReceived: received.toFixed(2), status, ...(received.gt(0) ? { receivedAt: new Date(`${todayKey()}T00:00:00.000Z`) } : {}) },
  });
}

const billingRecords: TableRules = {
  async prepare(ctx) {
    ctx.next.amount_total = dec.add(ctx.next.amount_subtotal as string, ctx.next.tax_amount as string).toFixed(2);
    if (ctx.op === "create") ctx.next.amount_received = "0.00";
  },
  validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (n.issued_date && n.due_date && (n.due_date as string) < (n.issued_date as string)) e.push("Due date can't be before the issue date.");
    const received = dec.of(n.amount_received as string);
    const total = dec.of(n.amount_total as string);
    if (entering(ctx, "status", ["paid"]) && (total.lte(0) || received.lt(total))) e.push("BILL-02: Paid only once allocated payments reconcile to the total.");
    if (entering(ctx, "status", ["part_paid"]) && (received.lte(0) || received.gte(total))) e.push("BILL-02: Part-paid must reflect allocated payments.");
    const issued = ["issued", "part_paid", "paid", "overdue"];
    if (ctx.prev && issued.includes(ctx.prev.status as string) && changed(ctx, "external_invoice_ref")) e.push("BILL-03: The invoice reference is fixed once issued.");
    if (ctx.prev && issued.includes(ctx.prev.status as string) && (changed(ctx, "amount_subtotal") || changed(ctx, "tax_amount"))) {
      e.push("BILL-01: Amounts are fixed once issued — issue a credit note instead.");
    }
    return e;
  },
};

const supportRequests: TableRules = {
  prepare(ctx) {
    if (ctx.op === "create") ctx.next.opened_at = nowIso();
    if (entering(ctx, "status", ["resolved", "closed"]) && blank(ctx.next.resolved_at)) ctx.next.resolved_at = nowIso();
    if (ctx.prev && entering(ctx, "status", ["reopened"])) ctx.next.resolved_at = null;
  },
  async validate(ctx) {
    const n = ctx.next;
    const e: string[] = [];
    if (["resolved", "closed"].includes(n.status as string) && blank(n.resolution_summary)) e.push("SUP-01: Resolving needs a resolution summary.");
    if (n.category === "scope_change" && ["in_progress", "resolved", "closed"].includes(n.status as string)) {
      const decision = n.change_approval_decision_id
        ? await getRec(ctx.tx, "decisions", n.change_approval_decision_id as string, ctx.actor.workspaceId)
        : null;
      if (decision?.status !== "approved") e.push("SUP-02: A scope change needs an approved decision before work starts.");
    }
    if (n.resolved_at && (n.resolved_at as string) < (n.opened_at as string)) e.push("SUP-03: Resolution can't be before the request was opened.");
    return e;
  },
  events(ctx) {
    return entering(ctx, "status", ["resolved", "closed"])
      ? [{ type: "support.resolved", key: `support.resolved:${ctx.id}:${ctx.next.row_version}`, aggregateId: ctx.id }]
      : [];
  },
};

// ---------------------------------------------------------------- support tables

const exactlyOne = (n: Rec, a: string, b: string, msg: string) => (blank(n[a]) === blank(n[b]) ? [msg] : []);

const parentMfd = async (ctx: RuleCtx, table: string, id: unknown) =>
  id ? ((await getRec(ctx.tx, table, String(id), ctx.actor.workspaceId))?.mfd_org_id as string | undefined) : undefined;

const SUPPORT: Record<string, TableRules> = {
  role_assignments: {
    prepare(ctx) {
      if (ctx.op === "create") ctx.next.assigned_by_user_id = ctx.actor.userId;
    },
    validate(ctx) {
      const n = ctx.next;
      return n.valid_to && (n.valid_to as string) <= (n.valid_from as string) ? ["Valid-to must be after valid-from."] : [];
    },
  },
  client_access_grants: {
    prepare(ctx) {
      if (ctx.op === "create") ctx.next.approved_by_user_id = ctx.actor.userId;
    },
  },
  mfd_registrations: {
    prepare(ctx) {
      if (!blank(ctx.next.verified_at) && (ctx.op === "create" || changed(ctx, "verified_at"))) ctx.next.verified_by_user_id = ctx.actor.userId;
    },
    validate(ctx) {
      const n = ctx.next;
      return n.valid_from && n.valid_to && (n.valid_to as string) < (n.valid_from as string) ? ["Valid-to can't be before valid-from."] : [];
    },
  },
  consent_records: {
    prepare(ctx) {
      if (ctx.op === "create") ctx.next.recorded_at = nowIso();
    },
    validate(ctx) {
      const n = ctx.next;
      const e: string[] = [];
      if (n.is_granted && blank(n.granted_at)) e.push("A granted consent needs the date it was granted.");
      if (n.granted_at && n.withdrawn_at && (n.withdrawn_at as string) < (n.granted_at as string)) e.push("Withdrawal can't be before the grant.");
      return e;
    },
  },
  assessment_questions: {
    prepare(ctx) {
      if (ctx.op === "create") ctx.next.revision ??= 1;
    },
    async validate(ctx) {
      const tpl = await getRec(ctx.tx, "assessment_templates", ctx.next.template_id as string, ctx.actor.workspaceId);
      const e: string[] = [];
      if (tpl && tpl.status !== "draft" && tpl.status !== "under_review") e.push("TMP-01: The question bank of a published template is immutable.");
      if (["single_select", "multi_select"].includes(ctx.next.answer_type as string)) {
        const opts = ctx.next.options_json;
        if (!Array.isArray(opts) || !opts.length || opts.some((o) => !o || typeof o !== "object" || blank((o as Rec).value) || blank((o as Rec).label))) {
          e.push('Select questions need options_json: [{"value": "...", "label": "...", "score": 0}]');
        }
      }
      return e;
    },
  },
  scoring_schemes: {
    async prepare(ctx) {
      if (ctx.op === "create") {
        const rows = await delegate(ctx.tx, "scoring_schemes").findMany({
          where: { workspaceId: ctx.actor.workspaceId, schemeCode: ctx.next.scheme_code },
          select: { version: true },
        });
        ctx.next.version = rows.reduce((m, r) => Math.max(m, r.version as number), 0) + 1;
        ctx.next.status ??= "draft";
      }
    },
    validate(ctx) {
      const e: string[] = [];
      if (ctx.prev?.status === "published" && (changed(ctx, "rubric_json") || changed(ctx, "weights_json") || changed(ctx, "scheme_code"))) {
        e.push("A published scoring scheme is immutable — create a new version.");
      }
      if (!ctx.next.weights_json || typeof ctx.next.weights_json !== "object" || Array.isArray(ctx.next.weights_json)) {
        e.push('weights_json must be an object of dimension weights, e.g. {"sales": 1}.');
      }
      return e;
    },
  },
  meeting_attendees: {
    async validate(ctx) {
      const e = exactlyOne(ctx.next, "contact_id", "member_id", "An attendee is either a client contact or a team member, not both.");
      if (ctx.next.contact_id) {
        const [org, contactOrg] = await Promise.all([parentMfd(ctx, "consulting_sessions", ctx.next.session_id), parentMfd(ctx, "mfd_contacts", ctx.next.contact_id)]);
        if (org !== contactOrg) e.push("The contact belongs to a different MFD.");
      }
      return e;
    },
  },
  transcript_segments: {
    validate(ctx) {
      return (ctx.next.end_ms as number) <= (ctx.next.start_ms as number) ? ["Segment end must be after its start."] : [];
    },
  },
  engagement_staff_assignments: {
    prepare(ctx) {
      if (ctx.op === "create") ctx.next.assigned_at = nowIso();
    },
    async validate(ctx) {
      const n = ctx.next;
      const e: string[] = [];
      if (n.revoked_at && (n.revoked_at as string) < (n.assigned_at as string)) e.push("Revocation can't be before assignment.");
      const org = await parentMfd(ctx, "consulting_engagements", n.engagement_id);
      if (ctx.op === "create" && org && !(await memberCanAccessOrg(ctx.tx, ctx.actor.workspaceId, n.member_id as string, org))) {
        e.push("Grant this team member access to the MFD before assigning them.");
      }
      return e;
    },
  },
  mfd_departments: {
    validate(ctx) {
      return ctx.next.parent_department_id && ctx.next.parent_department_id === ctx.next.id ? ["A department can't be its own parent."] : [];
    },
  },
  task_dependencies: {
    async validate(ctx) {
      const n = ctx.next;
      const e: string[] = [];
      if (n.task_id === n.depends_on_task_id) return ["A task can't depend on itself."];
      const [a, b] = await Promise.all([parentMfd(ctx, "action_tasks", n.task_id), parentMfd(ctx, "action_tasks", n.depends_on_task_id)]);
      if (a !== b) e.push("Both tasks must belong to the same MFD.");
      // DAG: walking from depends_on must never reach task_id.
      const seen = new Set<string>();
      const stack = [n.depends_on_task_id as string];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === n.task_id) {
          e.push("That dependency would create a cycle.");
          break;
        }
        if (seen.has(cur) || seen.size > 2000) continue;
        seen.add(cur);
        const next = await ctx.tx.ccTaskDependency.findMany({ where: { taskId: cur }, select: { dependsOnTaskId: true } });
        stack.push(...next.map((d) => d.dependsOnTaskId));
      }
      return e;
    },
  },
  project_milestones: {
    prepare(ctx) {
      if (entering(ctx, "status", ["verified"])) ctx.next.verified_at = nowIso();
    },
    validate(ctx) {
      return ctx.next.status === "verified" && blank(ctx.next.verified_by_member_id) ? ["A verified milestone needs its verifier."] : [];
    },
    async afterWrite(ctx) {
      await recomputeProjectCompletion(ctx.tx, ctx.actor.workspaceId, ctx.next.project_id as string);
    },
  },
  sop_versions: {
    async prepare(ctx) {
      const rows = await ctx.tx.ccSopVersion.findMany({ where: { sopId: ctx.next.sop_id as string }, select: { versionNo: true } });
      ctx.next.version_no = rows.reduce((m, r) => Math.max(m, r.versionNo), 0) + 1;
    },
    async validate(ctx) {
      const [a, b] = await Promise.all([parentMfd(ctx, "process_sop_register", ctx.next.sop_id), parentMfd(ctx, "document_records", ctx.next.document_id)]);
      const e = a !== b ? ["The SOP document belongs to a different MFD."] : [];
      if (["approved", "published"].includes(ctx.next.status as string) && (blank(ctx.next.approved_by_contact_id) || blank(ctx.next.approved_at))) {
        e.push("SOP-02: An approved version records who approved it and when.");
      }
      return e;
    },
    async afterWrite(ctx) {
      await delegate(ctx.tx, "process_sop_register").updateMany({
        where: { id: ctx.next.sop_id, workspaceId: ctx.actor.workspaceId },
        data: { sopVersion: ctx.next.version_no, currentDocumentId: ctx.next.document_id },
      });
    },
  },
  training_attendance: {
    async validate(ctx) {
      const [a, b] = await Promise.all([parentMfd(ctx, "training_events", ctx.next.training_id), parentMfd(ctx, "mfd_contacts", ctx.next.contact_id)]);
      return a !== b ? ["The attendee belongs to a different MFD."] : [];
    },
    async afterWrite(ctx) {
      await recomputeAttendance(ctx.tx, ctx.actor.workspaceId, ctx.next.training_id as string);
    },
  },
  decision_approvals: {
    prepare(ctx) {
      if (ctx.next.status !== "pending" && (ctx.op === "create" || changed(ctx, "status"))) ctx.next.actioned_at = nowIso();
    },
    validate(ctx) {
      const n = ctx.next;
      const e = exactlyOne(n, "approver_contact_id", "approver_member_id", "An approval comes from one client contact or one team member.");
      if (n.actor_type === "mfd_contact" && blank(n.approver_contact_id)) e.push("A client approval needs the approving contact.");
      if (n.actor_type === "aina_member" && blank(n.approver_member_id)) e.push("An internal approval needs the approving team member.");
      return e;
    },
  },
  document_links: {
    prepare(ctx) {
      ctx.next.linked_at = nowIso();
      ctx.next.linked_by_user_id = ctx.actor.userId;
    },
    async validate(ctx) {
      const target = LINK_TABLE[ctx.next.entity_type as string];
      if (!target) return ["Unknown link target."];
      const row = await getRec(ctx.tx, target, ctx.next.entity_id as string, ctx.actor.workspaceId);
      if (!row) return ["The linked record doesn't exist."];
      const docOrg = await parentMfd(ctx, "document_records", ctx.next.document_id);
      return "mfd_org_id" in row && row.mfd_org_id !== docOrg ? ["GV-04: Cannot link another organization's record."] : [];
    },
  },
  communication_participants: {
    validate(ctx) {
      return exactlyOne(ctx.next, "contact_id", "member_id", "A participant is either a client contact or a team member.");
    },
  },
  kpi_definitions: {
    async prepare(ctx) {
      const rows = await delegate(ctx.tx, "kpi_definitions").findMany({
        where: { workspaceId: ctx.actor.workspaceId, metricCode: ctx.next.metric_code },
        select: { version: true },
      });
      ctx.next.version = rows.reduce((m, r) => Math.max(m, r.version as number), 0) + 1;
    },
  },
  payment_allocations: {
    validate(ctx) {
      return dec.of(ctx.next.amount as string).lte(0) ? ["A payment amount must be greater than zero."] : [];
    },
    async afterWrite(ctx) {
      await recomputeBilling(ctx.tx, ctx.actor.workspaceId, ctx.next.billing_record_id as string);
    },
  },
  retention_holds: {
    prepare(ctx) {
      if (ctx.op === "create") {
        ctx.next.placed_at = nowIso();
        ctx.next.placed_by_user_id = ctx.actor.userId;
        ctx.next.status ??= "active";
      }
      if (entering(ctx, "status", ["released"])) ctx.next.released_at = nowIso();
    },
  },
};

/** document_links.entity_type → table. */
export const LINK_TABLE: Record<string, string> = {
  session: "consulting_sessions",
  assessment: "assessments",
  answer: "assessment_answers",
  finding: "findings",
  task: "action_tasks",
  project: "delivery_projects",
  sop: "process_sop_register",
  training: "training_events",
  decision: "decisions",
  risk: "risks_dependencies",
  review: "review_reports",
  support_request: "support_requests",
  improvement: "improvements",
  opportunity: "sales_opportunities",
  engagement: "consulting_engagements",
  communication: "communications",
};

export const RULES: Record<string, TableRules> = {
  leads,
  mfd_organizations: mfdOrganizations,
  mfd_contacts: mfdContacts,
  sales_opportunities: salesOpportunities,
  consulting_engagements: consultingEngagements,
  business_profiles: businessProfiles,
  assessment_templates: assessmentTemplates,
  assessments,
  findings,
  maturity_scorecards: maturityScorecards,
  consulting_sessions: consultingSessions,
  action_tasks: actionTasks,
  delivery_projects: deliveryProjects,
  process_sop_register: processSop,
  training_events: trainingEvents,
  decisions,
  media_records: mediaRecords,
  document_records: documentRecords,
  kpi_observations: kpiObservations,
  review_reports: reviewReports,
  improvements,
  team_members: teamMembers,
  risks_dependencies: risks,
  billing_records: billingRecords,
  support_requests: supportRequests,
  ...SUPPORT,
};

export { recomputeAttendance, recomputeBilling, recomputeProjectCompletion };
