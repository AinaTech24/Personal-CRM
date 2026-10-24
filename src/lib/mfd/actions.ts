/**
 * Workflow actions — the state changes the spec makes explicit (GV-09)
 * rather than plain PATCHes: lead conversion, template/scheme publishing and
 * versioning, the assessment lifecycle, scorecard calculation, KPI
 * corrections and file uploads. Each runs in one transaction through the
 * same engine (audit, approval trail, outbox) as ordinary writes.
 */
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { can, canUseOrg, rowInScope, type Actor } from "./access";
import { assertRowAccess, createIn, HttpError, kickAutomations, need, redact, updateIn, writeAudit } from "./engine";
import { completion, computeScorecard, currentAnswers, validateResponse, type AnswerLike, type QuestionLike, type SchemeLike } from "./scoring";
import { storeFile } from "./storage";
import { findRecs, getRec, type Tx } from "./store";
import type { Rec } from "./values";

const nowIso = () => new Date().toISOString();
const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && !v.trim());

async function load(tx: Tx, actor: Actor, table: string, id: string) {
  const rec = await getRec(tx, table, id, actor.workspaceId);
  if (!rec) throw new HttpError(404, "Not found");
  await assertRowAccess(actor, table, rec, tx);
  if (rec.archived_at) throw new HttpError(409, "This record is archived — restore it first.");
  return rec;
}

function expectStatus(rec: Rec, field: string, allowed: string[], verb: string) {
  if (!allowed.includes(rec[field] as string)) {
    throw new HttpError(409, `Can't ${verb} while the status is "${String(rec[field]).replace(/_/g, " ")}".`);
  }
}

/** The client's row_version when given (stale → 409), else the current one. */
const versionOf = (body: Rec, rec: Rec) => (typeof body.row_version === "number" ? body.row_version : (rec.row_version as number));

async function run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const out = await db.$transaction(fn, { timeout: 30000 });
  kickAutomations();
  return out;
}

// ---------------------------------------------------------------- leads

/**
 * AT-06: converts a lead into an MFD organization (new, or an existing one
 * passed as mfd_org_id), with its first contact, and re-points the lead's
 * opportunities — atomically, and never twice.
 */
export async function convertLead(actor: Actor, id: string, body: Rec) {
  need(actor, "leads", "U");
  return run(async (tx) => {
    const lead = await load(tx, actor, "leads", id);
    if (lead.status === "converted") throw new HttpError(409, "This lead is already converted.", [String(lead.converted_org_id)]);
    expectStatus(lead, "status", ["new", "contact_attempted", "connected", "qualified"], "convert this lead");

    let orgId = typeof body.mfd_org_id === "string" && body.mfd_org_id ? body.mfd_org_id : null;
    if (orgId) {
      const org = await getRec(tx, "mfd_organizations", orgId, actor.workspaceId);
      if (!org || org.archived_at) throw new HttpError(422, "That MFD organization doesn't exist.");
      if (!canUseOrg(actor, orgId)) throw new HttpError(403, "You don't have access to that MFD.");
    } else {
      need(actor, "mfd_organizations", "C");
      if (!body.force_new) {
        const dupes = await tx.ccMfdOrganization.findMany({
          where: {
            workspaceId: actor.workspaceId,
            archivedAt: null,
            OR: [{ legalName: lead.business_name as string }, ...(lead.email ? [{ primaryEmail: lead.email as string }] : [])],
          },
          select: { id: true, orgCode: true, legalName: true },
          take: 5,
        });
        if (dupes.length) {
          throw new HttpError(
            409,
            `An MFD named like this already exists (${dupes.map((d) => `${d.orgCode} ${d.legalName}`).join(", ")}). Link it instead, or confirm a new one.`,
            dupes.map((d) => d.id)
          );
        }
      }
      const org = await createIn(
        tx,
        actor,
        "mfd_organizations",
        {
          legal_name: lead.business_name,
          city: lead.city ?? null,
          state: lead.state ?? null,
          primary_email: lead.email ?? null,
          primary_phone: lead.mobile_e164 ?? null,
          country_iso2: "IN",
          org_status: "prospect",
          confidentiality_tier: "confidential",
          recording_allowed: false,
          account_owner_id: lead.assigned_member_id ?? null,
          source_lead_id: id,
        },
        { allow: ["source_lead_id"] }
      );
      orgId = org.id as string;
      await createIn(tx, actor, "mfd_contacts", {
        mfd_org_id: orgId,
        full_name: lead.lead_contact_name,
        email: lead.email ?? null,
        mobile_e164: lead.mobile_e164 ?? null,
        contact_type: "owner",
        is_decision_maker: true,
        is_approver: false,
        is_primary_contact: true,
        status_active: true,
      });
    }

    const saved = await updateIn(
      tx,
      actor,
      "leads",
      id,
      { row_version: versionOf(body, lead), status: "converted", converted_org_id: orgId, converted_at: nowIso(), mfd_org_id: orgId },
      { allow: ["status", "converted_org_id", "converted_at", "mfd_org_id"] }
    );

    // The lead's open opportunities move with it (they had no MFD until now).
    const opps = await findRecs(tx, "sales_opportunities", { lead_id: id, mfd_org_id: null });
    for (const o of opps) await updateIn(tx, actor, "sales_opportunities", o.id as string, { mfd_org_id: orgId }, { system: true });

    return { lead: redact(actor, "leads", saved), mfd_org_id: orgId };
  });
}

// ---------------------------------------------------------------- templates & schemes

const QUESTION_COPY = [
  "question_key",
  "revision",
  "section_name",
  "dimension",
  "question_text",
  "answer_type",
  "required",
  "options_json",
  "visibility_rule_json",
  "weight",
  "order_no",
  "status",
];

export async function publishTemplate(actor: Actor, id: string, body: Rec) {
  need(actor, "assessment_templates", "P");
  return run(async (tx) => {
    const tpl = await load(tx, actor, "assessment_templates", id);
    expectStatus(tpl, "status", ["draft", "under_review"], "publish");
    const questions = await findRecs(tx, "assessment_questions", { template_id: id, status: "active" });
    if (!questions.length) throw new HttpError(422, "Add at least one active question before publishing.");
    const saved = await updateIn(
      tx,
      actor,
      "assessment_templates",
      id,
      { row_version: versionOf(body, tpl), status: "published", published_at: nowIso(), published_by: actor.memberId },
      { allow: ["status", "published_at", "published_by"] }
    );
    return redact(actor, "assessment_templates", saved);
  });
}

/** TMP-01 / AT-10: a published template is changed only by copying it into a new draft version. */
export async function newTemplateVersion(actor: Actor, id: string) {
  need(actor, "assessment_templates", "C");
  return run(async (tx) => {
    const src = await load(tx, actor, "assessment_templates", id);
    const draft = await tx.ccAssessmentTemplate.findFirst({
      where: { workspaceId: actor.workspaceId, templateCode: src.template_code as string, status: { in: ["draft", "under_review"] }, archivedAt: null },
      select: { id: true, templateVersion: true },
    });
    if (draft) throw new HttpError(409, `Version ${draft.templateVersion} of this template is already in draft.`, [draft.id]);
    const copy: Rec = { status: "draft" };
    for (const k of ["mfd_org_id", "template_code", "template_name", "assessment_type", "description", "scoring_scheme_code", "scoring_scheme_version", "owner_member_id", "is_client_specific"]) {
      copy[k] = src[k] ?? null;
    }
    const tpl = await createIn(tx, actor, "assessment_templates", copy);
    for (const q of await findRecs(tx, "assessment_questions", { template_id: id })) {
      const data: Rec = { template_id: tpl.id };
      for (const k of QUESTION_COPY) data[k] = q[k] ?? null;
      await createIn(tx, actor, "assessment_questions", data, { allow: ["revision"] });
    }
    return redact(actor, "assessment_templates", tpl);
  });
}

export async function publishScheme(actor: Actor, id: string) {
  need(actor, "scoring_schemes", "P");
  return run(async (tx) => {
    const s = await load(tx, actor, "scoring_schemes", id);
    expectStatus(s, "status", ["draft", "under_review"], "publish");
    return updateIn(
      tx,
      actor,
      "scoring_schemes",
      id,
      { status: "published", published_at: nowIso(), published_by_user_id: actor.userId },
      { system: true }
    );
  });
}

export async function newSchemeVersion(actor: Actor, id: string) {
  need(actor, "scoring_schemes", "C");
  return run(async (tx) => {
    const s = await load(tx, actor, "scoring_schemes", id);
    return createIn(tx, actor, "scoring_schemes", { scheme_code: s.scheme_code, rubric_json: s.rubric_json, weights_json: s.weights_json, status: "draft" });
  });
}

// ---------------------------------------------------------------- assessments

async function questionsOf(tx: Tx, templateId: string): Promise<QuestionLike[]> {
  const qs = await findRecs(tx, "assessment_questions", { template_id: templateId });
  return qs
    .sort((a, b) => (a.order_no as number) - (b.order_no as number))
    .map((q) => ({
      id: q.id as string,
      question_key: q.question_key as string,
      dimension: q.dimension as string,
      answer_type: q.answer_type as string,
      required: !!q.required,
      options_json: q.options_json,
      visibility_rule_json: q.visibility_rule_json,
      weight: (q.weight as string | null) ?? null,
      status: q.status as string,
    }));
}

async function answersOf(tx: Tx, assessmentId: string) {
  const rows = await findRecs(tx, "assessment_answers", { assessment_id: assessmentId });
  return rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

const asAnswer = (a: Rec): AnswerLike => ({
  id: a.id as string,
  question_id: a.question_id as string,
  response_json: a.response_json,
  response_state: a.response_state as string,
  supersedes_answer_id: (a.supersedes_answer_id as string | null) ?? null,
  skip_reason: (a.skip_reason as string | null) ?? null,
});

async function refreshCompletion(tx: Tx, actor: Actor, asm: Rec, extra: Rec = {}, pre?: { questions: QuestionLike[]; answers: AnswerLike[] }) {
  const c = pre
    ? completion(pre.questions, pre.answers)
    : completion(await questionsOf(tx, asm.template_id as string), (await answersOf(tx, asm.id as string)).map(asAnswer));
  const saved = await updateIn(
    tx,
    actor,
    "assessments",
    asm.id as string,
    { response_count: c.response_count, completion_pct: c.completion_pct.toFixed(2), ...extra },
    { system: true }
  );
  return { saved, missingRequired: c.missingRequired };
}

/** Stable SHA-256 of the question set an assessment is issued against (spec version_snapshot_hash). */
export function questionSetHash(questions: QuestionLike[], texts: Map<string, string>) {
  const canonical = questions
    .filter((q) => q.status === "active")
    .map((q) => [q.id, q.question_key, q.dimension, q.answer_type, q.required, texts.get(q.id) ?? "", q.options_json ?? null, q.visibility_rule_json ?? null, q.weight]);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export async function issueAssessment(actor: Actor, id: string, body: Rec) {
  need(actor, "assessments", "U");
  return run(async (tx) => {
    const asm = await load(tx, actor, "assessments", id);
    expectStatus(asm, "status", ["draft"], "issue");
    const tpl = await getRec(tx, "assessment_templates", asm.template_id as string, actor.workspaceId);
    if (tpl?.status !== "published") throw new HttpError(422, "ASM-01: Only a published template version can be issued.");
    const raw = await findRecs(tx, "assessment_questions", { template_id: asm.template_id });
    const qs = await questionsOf(tx, asm.template_id as string);
    const hash = questionSetHash(qs, new Map(raw.map((q) => [q.id as string, q.question_text as string])));
    const saved = await updateIn(
      tx,
      actor,
      "assessments",
      id,
      {
        row_version: versionOf(body, asm),
        status: "issued",
        issued_at: nowIso(),
        version_snapshot_hash: hash,
        ...(typeof body.due_at === "string" && body.due_at ? { due_at: body.due_at } : {}),
      },
      { allow: ["status", "issued_at", "version_snapshot_hash"] }
    );
    return redact(actor, "assessments", saved);
  });
}

/**
 * Records one answer. Answers are append-only: a change adds a row that
 * supersedes the previous one, and changing an already-submitted answer is
 * a correction that needs a reason (AT-11).
 */
export async function answerQuestion(actor: Actor, id: string, body: Rec) {
  need(actor, "assessments", "U");
  return run(async (tx) => {
    const asm = await load(tx, actor, "assessments", id);
    expectStatus(asm, "status", ["issued", "in_progress", "reopened"], "answer");
    const qid = String(body.question_id ?? "");
    const questions = await questionsOf(tx, asm.template_id as string);
    const q = questions.find((x) => x.id === qid);
    if (!q || q.status !== "active") throw new HttpError(422, "That question isn't part of this assessment.");

    const skip = typeof body.skip_reason === "string" ? body.skip_reason.trim() : "";
    if (skip) {
      if (q.required) throw new HttpError(422, "A required question can't be skipped.");
    } else {
      const err = validateResponse(q, body.value);
      if (err) throw new HttpError(422, err);
    }

    const existing = (await answersOf(tx, id)).map(asAnswer);
    const prev = currentAnswers(existing).get(qid) ?? null;
    const correcting = prev?.response_state === "submitted" || prev?.response_state === "corrected";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (correcting && !reason) throw new HttpError(422, "Correcting a submitted answer needs a reason.");

    const answer = await createIn(
      tx,
      actor,
      "assessment_answers",
      {
        mfd_org_id: asm.mfd_org_id,
        assessment_id: id,
        question_id: qid,
        respondent_contact_id: typeof body.respondent_contact_id === "string" && body.respondent_contact_id ? body.respondent_contact_id : (asm.assigned_contact_id ?? null),
        respondent_user_id: actor.userId,
        response_json: skip ? null : { value: body.value },
        response_state: correcting ? "corrected" : "draft",
        original_text: typeof body.original_text === "string" && body.original_text ? body.original_text : null,
        submitted_at: correcting ? nowIso() : null,
        supersedes_answer_id: prev?.id ?? null,
        skip_reason: skip || null,
      },
      { system: true, trusted: true }
    );
    await createIn(
      tx,
      actor,
      "assessment_response_events",
      {
        assessment_answer_id: answer.id,
        actor_user_id: actor.userId,
        entity_event: correcting ? "corrected" : prev ? "changed" : "answered",
        occurred_at: nowIso(),
        details_json: correcting ? { reason, supersedes: prev?.id } : prev ? { supersedes: prev.id } : null,
      },
      { system: true, trusted: true }
    );
    const { saved } = await refreshCompletion(tx, actor, asm, asm.status === "issued" ? { status: "in_progress" } : {}, {
      questions,
      answers: [...existing, asAnswer(answer)],
    });
    return { answer, assessment: redact(actor, "assessments", saved) };
  });
}

export async function submitAssessment(actor: Actor, id: string, body: Rec) {
  need(actor, "assessments", "U");
  return run(async (tx) => {
    const asm = await load(tx, actor, "assessments", id);
    expectStatus(asm, "status", ["issued", "in_progress", "reopened"], "submit");
    const questions = await questionsOf(tx, asm.template_id as string);
    const answers = await answersOf(tx, id);
    const c = completion(questions, answers.map(asAnswer));
    if (c.missingRequired.length) {
      throw new HttpError(422, `${c.missingRequired.length} required question(s) still need an answer.`, c.missingRequired);
    }
    // Draft answers become submitted in one go (a state change, not a new response — no row is rewritten).
    const drafts = [...currentAnswers(answers.map(asAnswer)).values()].filter((a) => a.response_state === "draft").map((a) => a.id);
    if (drafts.length) {
      const at = new Date();
      await tx.ccAssessmentAnswer.updateMany({ where: { id: { in: drafts }, workspaceId: actor.workspaceId }, data: { responseState: "submitted", submittedAt: at } });
      await tx.ccAssessmentResponseEvent.createMany({
        data: drafts.map((id) => ({ id: randomUUID(), workspaceId: actor.workspaceId, assessmentAnswerId: id, actorUserId: actor.userId, entityEvent: "submitted", occurredAt: at })),
      });
      await tx.ccAuditEvent.createMany({
        data: drafts.map((id) => ({
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          entityTable: "assessment_answers",
          entityId: id,
          action: "submit",
          changedColumns: { response_state: { from: "draft", to: "submitted" } },
          recordedAt: at,
        })),
      });
    }
    if (typeof body.row_version === "number" && body.row_version !== asm.row_version) throw new HttpError(409, "This record was updated by another user. Reload and try again.");
    const { saved } = await refreshCompletion(tx, actor, asm, { status: "submitted", submitted_at: nowIso() });
    return redact(actor, "assessments", saved);
  });
}

export async function startAssessmentReview(actor: Actor, id: string, body: Rec) {
  need(actor, "assessments", "U");
  return run(async (tx) => {
    const asm = await load(tx, actor, "assessments", id);
    expectStatus(asm, "status", ["submitted"], "start the review");
    const reviewerId = (typeof body.reviewer_member_id === "string" && body.reviewer_member_id) || (asm.reviewer_member_id as string | null) || actor.memberId;
    if (!reviewerId) throw new HttpError(422, "Choose the reviewer.");
    const reviewer = await getRec(tx, "team_members", reviewerId, actor.workspaceId);
    if (!reviewer) throw new HttpError(422, "Reviewer not found.");
    const respondents = new Set((await answersOf(tx, id)).map((a) => a.respondent_user_id));
    if (respondents.has(reviewer.auth_user_id)) throw new HttpError(422, "The reviewer must be someone other than the respondent.");
    const saved = await updateIn(
      tx,
      actor,
      "assessments",
      id,
      { row_version: versionOf(body, asm), status: "under_review", reviewer_member_id: reviewerId },
      { allow: ["status"] }
    );
    return redact(actor, "assessments", saved);
  });
}

export async function approveAssessment(actor: Actor, id: string, body: Rec) {
  need(actor, "assessments", "P");
  return run(async (tx) => {
    const asm = await load(tx, actor, "assessments", id);
    expectStatus(asm, "status", ["under_review"], "approve");
    if (blank(asm.reviewer_member_id)) throw new HttpError(422, "Approval needs a reviewer.");
    const notes = typeof body.review_notes === "string" && body.review_notes.trim() ? { review_notes: body.review_notes } : {};
    const saved = await updateIn(
      tx,
      actor,
      "assessments",
      id,
      { row_version: versionOf(body, asm), status: "approved", approved_at: nowIso(), ...notes },
      { allow: ["status", "approved_at"] }
    );
    return redact(actor, "assessments", saved);
  });
}

export async function reopenAssessment(actor: Actor, id: string, body: Rec) {
  need(actor, "assessments", "U");
  return run(async (tx) => {
    const asm = await load(tx, actor, "assessments", id);
    expectStatus(asm, "status", ["submitted", "under_review"], "reopen");
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) throw new HttpError(422, "Say why the assessment is being reopened.");
    const stamp = `[Reopened ${new Date().toISOString().slice(0, 10)} by ${actor.name}] ${reason}`;
    const saved = await updateIn(
      tx,
      actor,
      "assessments",
      id,
      { row_version: versionOf(body, asm), status: "reopened", review_notes: asm.review_notes ? `${asm.review_notes as string}\n\n${stamp}` : stamp },
      { allow: ["status"] }
    );
    return redact(actor, "assessments", saved);
  });
}

// ---------------------------------------------------------------- scorecards

/** AT-12: recomputes a draft scorecard from its assessment's current answers under the pinned scheme version. */
export async function calculateScorecardIn(tx: Tx, actor: Actor, id: string) {
  const sc = await getRec(tx, "maturity_scorecards", id, actor.workspaceId);
  if (!sc) throw new HttpError(404, "Not found");
  expectStatus(sc, "status", ["draft", "reviewed"], "recalculate");
  if (blank(sc.assessment_id)) throw new HttpError(422, "Link the assessment this scorecard is calculated from.");
  const asm = await getRec(tx, "assessments", sc.assessment_id as string, actor.workspaceId);
  if (!asm || !["submitted", "under_review", "approved"].includes(asm.status as string)) {
    throw new HttpError(422, "The assessment must be submitted before it can be scored.");
  }
  const scheme = await tx.ccScoringScheme.findFirst({
    where: { workspaceId: actor.workspaceId, schemeCode: sc.scoring_scheme_code as string, version: sc.scoring_scheme_version as number, status: "published" },
  });
  if (!scheme) throw new HttpError(422, "SCR-01: The scoring scheme version must be published.");

  const questions = await questionsOf(tx, asm.template_id as string);
  const answers = (await answersOf(tx, asm.id as string)).map(asAnswer);
  const links = await tx.ccDocumentLink.findMany({ where: { workspaceId: actor.workspaceId, entityType: "answer", entityId: { in: answers.map((a) => a.id) } }, select: { entityId: true } });
  const schemeLike: SchemeLike = { rubric_json: scheme.rubricJson, weights_json: scheme.weightsJson };
  const r = computeScorecard(questions, answers, schemeLike, new Set(links.map((l) => l.entityId)), sc.scorecard_type as string);

  // Dimension rows are derived output of this calculation; a recalculation replaces them.
  await tx.ccScorecardDimensionScore.deleteMany({ where: { scorecardId: id } });
  for (const d of r.dimensions) {
    await createIn(
      tx,
      actor,
      "scorecard_dimension_scores",
      {
        scorecard_id: id,
        dimension: d.dimension,
        answers_eligible: d.answers_eligible,
        answers_count: d.answers_count,
        raw_score: d.raw_score === null ? null : d.raw_score.toFixed(4),
        normalized_score: d.normalized_score === null ? null : d.normalized_score.toFixed(4),
        coverage_pct: d.coverage_pct === null ? null : d.coverage_pct.toFixed(2),
        evidence_count: d.evidence_count,
      },
      { system: true, trusted: true }
    );
  }
  return updateIn(
    tx,
    actor,
    "maturity_scorecards",
    id,
    {
      score_value: r.score_value === null ? null : r.score_value.toFixed(4),
      coverage_pct: r.coverage_pct === null ? null : r.coverage_pct.toFixed(2),
      evidence_coverage_pct: r.evidence_coverage_pct === null ? null : r.evidence_coverage_pct.toFixed(2),
      maturity_level: r.maturity_level,
      calculated_at: nowIso(),
      status: "draft",
    },
    { system: true }
  );
}

export async function calculateScorecard(actor: Actor, id: string) {
  need(actor, "maturity_scorecards", "U");
  return run(async (tx) => {
    await load(tx, actor, "maturity_scorecards", id);
    return redact(actor, "maturity_scorecards", await calculateScorecardIn(tx, actor, id));
  });
}

// ---------------------------------------------------------------- KPIs

/** KPI-02 / AT-15: a correction is a new revision that supersedes the old reading, which stays. */
export async function correctKpi(actor: Actor, id: string, body: Rec) {
  need(actor, "kpi_observations", "C");
  return run(async (tx) => {
    const prev = await load(tx, actor, "kpi_observations", id);
    const already = await tx.ccKpiObservation.findFirst({ where: { supersedesObservationId: id }, select: { id: true } });
    if (already) throw new HttpError(409, "This reading has already been corrected — correct the latest revision.", [already.id]);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason) throw new HttpError(422, "Say why the reading is being corrected.");
    if (body.value_numeric === undefined || body.value_numeric === null || body.value_numeric === "") throw new HttpError(422, "Enter the corrected value.");
    const data: Rec = {
      supersedes_observation_id: id,
      revision_number: (prev.revision_number as number) + 1,
      value_numeric: body.value_numeric,
      data_quality: "corrected",
      entered_by: actor.memberId ?? prev.entered_by,
      notes: `Correction of revision ${prev.revision_number as number}: ${reason}`,
      source_document_id: typeof body.source_document_id === "string" && body.source_document_id ? body.source_document_id : (prev.source_document_id ?? null),
    };
    for (const k of ["mfd_org_id", "kpi_definition_id", "period_type", "period_start", "period_end", "unit", "branch_id", "source"]) data[k] = prev[k] ?? null;
    const saved = await createIn(tx, actor, "kpi_observations", data, { allow: ["supersedes_observation_id", "revision_number"] });
    return redact(actor, "kpi_observations", saved);
  });
}

// ---------------------------------------------------------------- files

export interface UploadedFile {
  name: string;
  bytes: Buffer;
}

async function storeChecked(actor: Actor, mfdOrgId: string | null, file: UploadedFile) {
  const stored = await db.$transaction(async (tx) => {
    const s = await storeFile(tx, { workspaceId: actor.workspaceId, mfdOrgId, userId: actor.userId, fileName: file.name, bytes: file.bytes });
    await writeAudit(tx, actor, "file_objects", s.id, s.scanStatus === "clean" ? "upload" : "upload_quarantined", null, null);
    return s;
  });
  // AT-05: a quarantined file is kept (for the audit trail) but never attached or downloadable.
  if (stored.scanStatus !== "clean") throw new HttpError(422, `The file was quarantined: ${stored.reason}.`);
  return stored.id;
}

/** Adds a new version of a document's file (document_versions is the immutable history). */
export async function uploadDocumentFile(actor: Actor, id: string, file: UploadedFile, changeNote: string | null) {
  need(actor, "document_records", "U");
  const doc = await db.$transaction((tx) => load(tx, actor, "document_records", id));
  const fileId = await storeChecked(actor, doc.mfd_org_id as string, file);
  return run(async (tx) => {
    const cur = await load(tx, actor, "document_records", id);
    const version = (cur.current_version as number) + 1;
    await createIn(
      tx,
      actor,
      "document_versions",
      { document_id: id, version_no: version, file_object_id: fileId, uploaded_at: nowIso(), uploaded_by_user_id: actor.userId, change_note: changeNote },
      { system: true }
    );
    const reset = ["requested", "rejected", "accepted", "superseded"].includes(cur.status as string);
    const saved = await updateIn(
      tx,
      actor,
      "document_records",
      id,
      {
        row_version: cur.row_version,
        file_object_id: fileId,
        current_version: version,
        ...(reset ? { status: "received", received_at: nowIso(), rejection_reason: null } : {}),
      },
      { allow: ["file_object_id", "current_version", "received_at"] }
    );
    return redact(actor, "document_records", saved);
  });
}

export async function uploadMediaFile(actor: Actor, id: string, file: UploadedFile) {
  need(actor, "media_records", "U");
  const media = await db.$transaction((tx) => load(tx, actor, "media_records", id));
  if (!["uploaded", "failed"].includes(media.status as string)) throw new HttpError(409, "The file can't be replaced once processing has started.");
  const fileId = await storeChecked(actor, media.mfd_org_id as string, file);
  return run(async (tx) => {
    const cur = await load(tx, actor, "media_records", id);
    const saved = await updateIn(tx, actor, "media_records", id, { row_version: cur.row_version, file_object_id: fileId, status: "uploaded" }, { allow: ["file_object_id"] });
    return redact(actor, "media_records", saved);
  });
}

/**
 * GV-08 for files: readable only through a record that references it and
 * that the actor can read (document, document version, recording), or by
 * its uploader / an admin when nothing references it yet.
 */
export async function assertFileAccess(actor: Actor, fileId: string) {
  const file = await getRec(db, "file_objects", fileId, actor.workspaceId);
  if (!file) throw new HttpError(404, "Not found");
  if (file.scan_status !== "clean") throw new HttpError(423, "This file is quarantined or still being scanned.");

  const refs: { table: string; id: string }[] = [];
  for (const d of await db.ccDocumentRecord.findMany({ where: { workspaceId: actor.workspaceId, fileObjectId: fileId }, select: { id: true } })) refs.push({ table: "document_records", id: d.id });
  for (const v of await db.ccDocumentVersion.findMany({ where: { workspaceId: actor.workspaceId, fileObjectId: fileId }, select: { documentId: true } })) refs.push({ table: "document_records", id: v.documentId });
  for (const m of await db.ccMediaRecord.findMany({ where: { workspaceId: actor.workspaceId, fileObjectId: fileId }, select: { id: true } })) refs.push({ table: "media_records", id: m.id });

  for (const r of refs) {
    if (!can(actor, r.table, "R")) continue;
    const rec = await getRec(db, r.table, r.id, actor.workspaceId);
    if (rec && rowInScope(actor, r.table, rec)) return file;
  }
  if (!refs.length && (file.uploaded_by_user_id === actor.userId || [...actor.roles].some((x) => x === "platform_admin" || x === "aina_admin"))) return file;
  throw new HttpError(404, "Not found");
}
