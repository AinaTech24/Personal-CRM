/**
 * The spec's automations (AUT-01..16), driven by the transactional outbox
 * (GV-11). Writes that matter emit an outbox event in the same transaction;
 * this processor picks pending events up, runs the matching job with the
 * triggering user's identity (so the audit trail attributes it), and marks
 * the event published. Every job only drafts work — tasks, draft records,
 * document requests, notifications — and never approves or publishes
 * anything on a human's behalf.
 *
 * Time-based jobs (AUT-05 overdue tasks, AUT-14 month close, AUT-16
 * renewals) run from /api/v1/automations/run on a schedule, deduplicated by
 * an idempotency key per record and period.
 */
import { db } from "@/lib/db";
import { notifyAndPush } from "@/lib/notify";
import type { Actor } from "./access";
import { calculateScorecardIn } from "./actions";
import { systemActor, workspaceId } from "./actor";
import { createIn, HttpError, updateIn } from "./engine";
import { scoreAnswer, currentAnswers, type AnswerLike, type QuestionLike } from "./scoring";
import { findRecs, getRec, type Client, type Tx } from "./store";
import type { Rec } from "./values";

const MAX_ATTEMPTS = 5;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const inDays = (d: number) => iso(Date.now() + d * DAY);
const todayKey = () => new Date().toISOString().slice(0, 10);

interface Notice {
  memberIds?: (string | null | undefined)[];
  userIds?: (string | null | undefined)[];
  code: string;
  message: string;
  href: string;
}

type Job = (tx: Tx, actor: Actor, aggregateId: string, payload: Rec) => Promise<Notice[]>;

// ---------------------------------------------------------------- helpers

async function task(tx: Tx, actor: Actor, data: Rec) {
  return createIn(
    tx,
    actor,
    "action_tasks",
    { status: "not_started", priority: "normal", owner_party: "aina", created_from: "automation", due_at: inDays(3), ...data },
    { system: true }
  );
}

async function docRequest(tx: Tx, actor: Actor, data: Rec) {
  return createIn(tx, actor, "document_records", { status: "requested", classification: "confidential", requested_at: iso(Date.now()), ...data }, { system: true });
}

/** Who looks after an MFD's work: the engagement's lead consultant, else the account owner. */
async function ownerFor(client: Client, ws: string, orgId: string, engagementId?: string | null) {
  if (engagementId) {
    const e = await getRec(client, "consulting_engagements", engagementId, ws);
    if (e?.lead_consultant_id) return e.lead_consultant_id as string;
  }
  const org = await getRec(client, "mfd_organizations", orgId, ws);
  return (org?.account_owner_id as string | null) ?? null;
}

const href = (module: string, id: string) => `/consulting/${module}/${id}`;

// ---------------------------------------------------------------- event jobs

const JOBS: Record<string, Job> = {
  // AUT-01
  async "lead.qualified"(tx, actor, id) {
    const lead = await getRec(tx, "leads", id, actor.workspaceId);
    if (!lead) return [];
    if (lead.mfd_org_id) {
      await task(tx, actor, {
        mfd_org_id: lead.mfd_org_id,
        title: `Discovery call — ${lead.business_name as string}`,
        assigned_member_id: lead.assigned_member_id,
        due_at: inDays(2),
        created_from: "automation:AUT-01",
      });
    } else if (!lead.next_follow_up_at) {
      // A pre-conversion lead has no MFD yet to hang a task on; schedule the follow-up on the lead itself.
      await updateIn(tx, actor, "leads", id, { next_follow_up_at: inDays(2) }, { system: true });
    }
    return [{ memberIds: [lead.assigned_member_id as string], code: "AUT-01", message: `${lead.business_name as string} is qualified — schedule the discovery call`, href: href("leads", id) }];
  },

  // AUT-02
  async "opportunity.won"(tx, actor, id) {
    const opp = await getRec(tx, "sales_opportunities", id, actor.workspaceId);
    if (!opp?.mfd_org_id) return [];
    const existing = await tx.ccConsultingEngagement.findFirst({ where: { workspaceId: actor.workspaceId, opportunityId: id }, select: { id: true } });
    if (existing) return [];
    const lead = (await ownerFor(tx, actor.workspaceId, opp.mfd_org_id as string)) ?? (opp.owner_member_id as string);
    const eng = await createIn(
      tx,
      actor,
      "consulting_engagements",
      {
        mfd_org_id: opp.mfd_org_id,
        engagement_name: opp.opportunity_name,
        opportunity_id: id,
        service_type: opp.service_type,
        contract_status: "draft", // never activated without signed evidence (ENG-02)
        currency: opp.currency,
        contract_value: opp.expected_value ?? null,
        start_date: opp.proposed_start_date ?? null,
        lead_consultant_id: lead,
        objectives: `To be confirmed at kickoff (drafted from ${opp.opportunity_no as string}).`,
        in_scope: "As per the accepted proposal — confirm before activation.",
      },
      { system: true }
    );
    for (const [title, category] of [
      ["Signed engagement contract", "contract"],
      ["Signed NDA", "contract"],
    ] as const) {
      await docRequest(tx, actor, { mfd_org_id: opp.mfd_org_id, document_title: title, document_category: category, request_due_at: inDays(7) });
    }
    return [{ memberIds: [lead, opp.owner_member_id as string], code: "AUT-02", message: `${opp.opportunity_name as string} was won — a draft engagement and intake checklist are ready`, href: href("consulting_engagements", eng.id as string) }];
  },

  // AUT-03
  async "engagement.activated"(tx, actor, id) {
    const eng = await getRec(tx, "consulting_engagements", id, actor.workspaceId);
    if (!eng) return [];
    const org = eng.mfd_org_id as string;
    const start = eng.start_date ? Date.parse(`${eng.start_date as string}T10:00:00+05:30`) : Date.now() + 3 * DAY;
    const kickoffAt = Math.max(start, Date.now() + DAY);
    await createIn(
      tx,
      actor,
      "consulting_sessions",
      {
        mfd_org_id: org,
        engagement_id: id,
        session_type: "discovery",
        status: "scheduled",
        title: `Kickoff — ${eng.engagement_name as string}`,
        meeting_mode: "video",
        starts_at: iso(kickoffAt),
        ends_at: iso(kickoffAt + 90 * 60_000),
        organizer_member_id: eng.lead_consultant_id,
        recording_expected: false,
      },
      { system: true }
    );
    for (const [title, category] of [
      ["Organization chart and roles", "org_chart"],
      ["Current process maps / how work flows today", "process_map"],
      ["Last 12 months business MIS (AUM, SIP book, clients)", "evidence"],
    ] as const) {
      await docRequest(tx, actor, { mfd_org_id: org, document_title: title, document_category: category, request_due_at: inDays(10) });
    }
    await task(tx, actor, {
      mfd_org_id: org,
      engagement_id: id,
      title: "Issue the initial diagnostic assessment",
      assigned_member_id: eng.lead_consultant_id,
      due_at: inDays(7),
      created_from: "automation:AUT-03",
    });
    return [{ memberIds: [eng.lead_consultant_id as string], code: "AUT-03", message: `${eng.engagement_name as string} is active — kickoff, document requests and first tasks created`, href: href("consulting_engagements", id) }];
  },

  // AUT-04
  async "session.completed"(tx, actor, id) {
    const s = await getRec(tx, "consulting_sessions", id, actor.workspaceId);
    if (!s) return [];
    await task(tx, actor, {
      mfd_org_id: s.mfd_org_id,
      engagement_id: s.engagement_id ?? null,
      session_id: id,
      title: `Draft minutes for client approval — ${s.title as string}`,
      assigned_member_id: s.organizer_member_id,
      due_at: inDays(2),
      created_from: "automation:AUT-04",
    });
    const media = await findRecs(tx, "media_records", { session_id: id });
    if (media.length) {
      await task(tx, actor, {
        mfd_org_id: s.mfd_org_id,
        session_id: id,
        title: `Human review of the recording/transcript (consent-checked) — ${s.title as string}`,
        assigned_member_id: s.organizer_member_id,
        acceptance_criteria: "Transcript reviewed by a person; nothing shared before review.",
        created_from: "automation:AUT-04",
      });
    }
    return [{ memberIds: [s.organizer_member_id as string], code: "AUT-04", message: `Session "${s.title as string}" completed — draft the minutes for client approval`, href: href("consulting_sessions", id) }];
  },

  // AUT-06
  async "media.uploaded"(tx, actor, id) {
    const m = await getRec(tx, "media_records", id, actor.workspaceId);
    if (!m) return [];
    const consentOk = m.consent_status === "granted" || m.consent_status === "not_required";
    const message = consentOk
      ? `${m.media_number as string} uploaded and scanned clean — ready for transcription and human review`
      : `${m.media_number as string} uploaded — processing is blocked until purpose consent is granted`;
    return [{ userIds: [actor.userId], code: "AUT-06", message, href: href("media_records", id) }];
  },

  // AUT-07
  async "assessment.issued"(tx, actor, id) {
    const a = await getRec(tx, "assessments", id, actor.workspaceId);
    if (!a) return [];
    // Inviting the client is a person's call: the consultant sends the respondent link from the assessment page.
    const message =
      a.assessment_mode === "self_assessment" && a.assigned_contact_id
        ? `${a.assessment_number as string} was issued — send the client their respondent link from the assessment page`
        : `${a.assessment_number as string} was issued — collect the respondent's answers`;
    return [{ memberIds: [a.assigned_consultant_id as string], code: "AUT-07", message, href: href("assessments", id) }];
  },

  // AUT-08
  async "assessment.submitted"(tx, actor, id) {
    const a = await getRec(tx, "assessments", id, actor.workspaceId);
    if (!a) return [];
    let reviewers: string[] = a.reviewer_member_id ? [a.reviewer_member_id as string] : [];
    let userIds: string[] = [];
    if (!reviewers.length) {
      const heads = await tx.ccRoleAssignment.findMany({ where: { workspaceId: actor.workspaceId, role: "consulting_head", OR: [{ validTo: null }, { validTo: { gt: new Date() } }] }, select: { userId: true } });
      userIds = heads.map((h) => h.userId);
      reviewers = [];
    }
    return [
      {
        memberIds: reviewers,
        userIds,
        code: "AUT-08",
        message: `${a.assessment_number as string} was submitted (${a.completion_pct as string}% complete) — assign a reviewer and check the evidence`,
        href: href("assessments", id),
      },
    ];
  },

  // AUT-09
  async "assessment.approved"(tx, actor, id) {
    const a = await getRec(tx, "assessments", id, actor.workspaceId);
    if (!a) return [];
    const tpl = await getRec(tx, "assessment_templates", a.template_id as string, actor.workspaceId);
    let scorecardId: string | null = null;
    let scheme: { schemeCode: string; version: number; rubricJson: unknown } | null = null;
    if (tpl?.scoring_scheme_code) {
      scheme = await tx.ccScoringScheme.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          schemeCode: tpl.scoring_scheme_code as string,
          status: "published",
          ...(tpl.scoring_scheme_version ? { version: tpl.scoring_scheme_version as number } : {}),
        },
        orderBy: { version: "desc" },
        select: { schemeCode: true, version: true, rubricJson: true },
      });
    }
    if (scheme) {
      const sc = await createIn(
        tx,
        actor,
        "maturity_scorecards",
        {
          mfd_org_id: a.mfd_org_id,
          engagement_id: a.engagement_id ?? null,
          assessment_id: id,
          scorecard_type: "maturity",
          scorecard_date: todayKey(),
          scoring_scheme_code: scheme.schemeCode,
          scoring_scheme_version: scheme.version,
          status: "draft",
        },
        { system: true }
      );
      scorecardId = sc.id as string;
      await calculateScorecardIn(tx, actor, scorecardId);
    }

    // Draft findings for low-scoring answers — "identified" only; a consultant validates and accepts them.
    const qs = await findRecs(tx, "assessment_questions", { template_id: a.template_id });
    const answers = await findRecs(tx, "assessment_answers", { assessment_id: id });
    const current = currentAnswers(answers.map((x) => x as unknown as AnswerLike));
    const scale = (scheme?.rubricJson as { scale?: { min?: number; max?: number } } | null)?.scale;
    const min = typeof scale?.min === "number" ? scale.min : 1;
    const max = typeof scale?.max === "number" ? scale.max : 5;
    let drafted = 0;
    for (const q of qs.sort((x, y) => (x.order_no as number) - (y.order_no as number))) {
      if (drafted >= 25) break;
      const ans = current.get(q.id as string);
      const s = scoreAnswer(q as unknown as QuestionLike, ans, { rubric_json: scheme?.rubricJson ?? null, weights_json: {} });
      if (s === null || s > min + (max - min) * 0.4) continue;
      await createIn(
        tx,
        actor,
        "findings",
        {
          mfd_org_id: a.mfd_org_id,
          engagement_id: a.engagement_id ?? null,
          assessment_id: id,
          dimension: q.dimension,
          category: "missing_process",
          title: `${q.section_name as string}: ${String(q.question_text).slice(0, 200)}`,
          description: `Scored ${s} of ${max} in ${a.assessment_number as string}. Drafted automatically from the assessment — validate before sharing.`,
          severity: s <= min ? "high" : "medium",
          status: "identified",
          owner_member_id: a.assigned_consultant_id,
          evidence_verified: false,
        },
        { system: true }
      );
      drafted++;
    }
    await task(tx, actor, {
      mfd_org_id: a.mfd_org_id,
      engagement_id: a.engagement_id ?? null,
      title: `Review the scorecard and ${drafted} drafted finding(s) — ${a.assessment_number as string}`,
      assigned_member_id: a.assigned_consultant_id,
      acceptance_criteria: "Scores checked against evidence; findings validated or rejected before anything is client-visible.",
      created_from: "automation:AUT-09",
    });
    return [
      {
        memberIds: [a.assigned_consultant_id as string],
        code: "AUT-09",
        message: `${a.assessment_number as string} approved — ${scorecardId ? "scorecard calculated, " : ""}${drafted} finding(s) drafted for review`,
        href: scorecardId ? href("maturity_scorecards", scorecardId) : href("assessments", id),
      },
    ];
  },

  // AUT-10
  async "finding.accepted"(tx, actor, id) {
    const f = await getRec(tx, "findings", id, actor.workspaceId);
    if (!f) return [];
    const priority = f.severity === "critical" ? "critical" : f.severity === "high" ? "high" : "normal";
    await task(tx, actor, {
      mfd_org_id: f.mfd_org_id,
      engagement_id: f.engagement_id ?? null,
      finding_id: id,
      title: `Action: ${String(f.title).slice(0, 230)}`,
      description: (f.recommendation as string | null) ?? null,
      priority,
      assigned_member_id: f.owner_member_id,
      acceptance_criteria: "Evidence that the gap is closed, verified by someone other than the assignee.",
      due_at: inDays(priority === "critical" ? 3 : 14),
      created_from: "automation:AUT-10",
    });
    return [{ memberIds: [f.owner_member_id as string], code: "AUT-10", message: `Finding accepted — a proposed action was created for "${f.title as string}"`, href: href("findings", id) }];
  },

  // AUT-11
  async "sop.published"(tx, actor, id) {
    const s = await getRec(tx, "process_sop_register", id, actor.workspaceId);
    if (!s) return [];
    await task(tx, actor, {
      mfd_org_id: s.mfd_org_id,
      title: `Verify adoption of SOP ${s.process_code as string} v${s.sop_version as number}`,
      assigned_member_id: s.aina_owner_member_id,
      acceptance_criteria: "Training adoption check shows staff using the published version.",
      due_at: inDays(30),
      created_from: "automation:AUT-11",
    });
    return [{ memberIds: [s.aina_owner_member_id as string], code: "AUT-11", message: `SOP ${s.process_code as string} was published — adoption verification scheduled`, href: href("process_sop_register", id) }];
  },

  // AUT-12
  async "training.completed"(tx, actor, id) {
    const t = await getRec(tx, "training_events", id, actor.workspaceId);
    if (!t) return [];
    const due = t.follow_up_check_date ? `${t.follow_up_check_date as string}T12:00:00.000Z` : inDays(14);
    await task(tx, actor, {
      mfd_org_id: t.mfd_org_id,
      engagement_id: t.engagement_id ?? null,
      project_id: t.project_id ?? null,
      title: `Collect attendance, feedback and adoption evidence — ${t.training_title as string}`,
      assigned_member_id: t.trainer_member_id,
      acceptance_criteria: "Attendance marked, feedback recorded, trainer sign-off and an adoption check on participants.",
      due_at: due,
      created_from: "automation:AUT-12",
    });
    return [{ memberIds: [t.trainer_member_id as string], code: "AUT-12", message: `Training "${t.training_title as string}" completed — record attendance and adoption`, href: href("training_events", id) }];
  },

  // AUT-13 (scope_change.approved): an approved decision unblocks the scope-change requests that cite it.
  async "decision.approved"(tx, actor, id) {
    const requests = await tx.ccSupportRequest.findMany({
      where: { workspaceId: actor.workspaceId, changeApprovalDecisionId: id, category: "scope_change", archivedAt: null },
    });
    const notices: Notice[] = [];
    for (const r of requests) {
      const owner = r.assignedMemberId ?? (await ownerFor(tx, actor.workspaceId, r.mfdOrgId, r.engagementId));
      await task(tx, actor, {
        mfd_org_id: r.mfdOrgId,
        engagement_id: r.engagementId,
        title: `Implement approved change — ${r.ticketNumber}`,
        description: r.subject,
        assigned_member_id: owner,
        acceptance_criteria: "Change delivered as approved; client confirms.",
        created_from: "automation:AUT-13",
      });
      await task(tx, actor, {
        mfd_org_id: r.mfdOrgId,
        engagement_id: r.engagementId,
        title: `Review contract amendment / fee for ${r.ticketNumber}`,
        assigned_member_id: owner,
        created_from: "automation:AUT-13",
      });
      notices.push({ memberIds: [owner], code: "AUT-13", message: `Scope change ${r.ticketNumber} approved — implementation and contract review tasks created`, href: href("support_requests", r.id) });
    }
    return notices;
  },

  // AUT-15
  async "kpi.corrected"(tx, actor, id, payload) {
    const obs = await getRec(tx, "kpi_observations", id, actor.workspaceId);
    const old = typeof payload.supersedes === "string" ? payload.supersedes : null;
    if (!obs || !old) return [];
    const impacted: { label: string; module: string; id: string; engagement: string | null }[] = [];
    const imps = await tx.ccImprovement.findMany({
      where: { workspaceId: actor.workspaceId, archivedAt: null, OR: [{ baselineKpiObservationId: old }, { resultKpiObservationId: old }] },
      select: { id: true, improvementNumber: true, engagementId: true },
    });
    for (const i of imps) impacted.push({ label: `improvement ${i.improvementNumber}`, module: "improvements", id: i.id, engagement: i.engagementId });
    const reviews = await tx.ccReviewReport.findMany({
      where: {
        workspaceId: actor.workspaceId,
        mfdOrgId: obs.mfd_org_id as string,
        archivedAt: null,
        status: { not: "draft" },
        periodStart: { lt: new Date(`${obs.period_end as string}T00:00:00.000Z`) },
        periodEnd: { gt: new Date(`${obs.period_start as string}T00:00:00.000Z`) },
      },
      select: { id: true, reviewNumber: true, engagementId: true },
    });
    for (const r of reviews) impacted.push({ label: `review ${r.reviewNumber}`, module: "review_reports", id: r.id, engagement: r.engagementId });
    const notices: Notice[] = [];
    for (const x of impacted) {
      const owner = await ownerFor(tx, actor.workspaceId, obs.mfd_org_id as string, x.engagement);
      // Published versions are kept as they are; the task is to re-issue, not overwrite.
      await task(tx, actor, {
        mfd_org_id: obs.mfd_org_id,
        engagement_id: x.engagement,
        title: `Re-check ${x.label} — a KPI it uses was corrected`,
        assigned_member_id: owner,
        created_from: "automation:AUT-15",
      });
      notices.push({ memberIds: [owner], code: "AUT-15", message: `A KPI used by ${x.label} was corrected — re-check it`, href: href(x.module, x.id) });
    }
    return notices;
  },

  // Events with no automation of their own (kept so they're marked handled).
  async "risk.critical"(tx, actor, id) {
    const r = await getRec(tx, "risks_dependencies", id, actor.workspaceId);
    if (!r) return [];
    const owner = (r.assigned_member_id as string | null) ?? (await ownerFor(tx, actor.workspaceId, r.mfd_org_id as string, r.engagement_id as string | null));
    return [{ memberIds: [owner], code: "RSK", message: `Critical ${r.risk_type as string}: ${r.title as string} — escalate now`, href: href("risks_dependencies", id) }];
  },
  async "support.resolved"() {
    return [];
  },
};

// ---------------------------------------------------------------- notifications

async function deliver(actor: Actor | null, notices: Notice[]) {
  const ws = await workspaceId();
  for (const n of notices) {
    const users = new Set<string>(n.userIds?.filter((x): x is string => !!x) ?? []);
    const members = n.memberIds?.filter((x): x is string => !!x) ?? [];
    if (members.length) {
      const rows = await db.ccTeamMember.findMany({ where: { id: { in: members } }, select: { authUserId: true } });
      for (const r of rows) users.add(r.authUserId);
    }
    for (const userId of users) {
      try {
        await notifyAndPush(userId, "consulting_update", { message: n.message, href: n.href, actorName: actor?.name ?? "" }, { title: "Command Centre", body: n.message, url: n.href, tag: `cc-${n.code}` });
        await db.ccNotificationDelivery.create({
          data: { workspaceId: ws, recipientUserId: userId, templateCode: n.code, channel: "portal", state: "sent", attemptedAt: new Date() },
        });
      } catch (e) {
        console.error("[mfd automations] notify failed", e);
        await db.ccNotificationDelivery
          .create({ data: { workspaceId: ws, recipientUserId: userId, templateCode: n.code, channel: "portal", state: "failed", attemptedAt: new Date() } })
          .catch(() => {});
      }
    }
  }
}

// ---------------------------------------------------------------- outbox processor

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Debounced kick after a write commits. */
export function processOutboxSoon() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void processOutbox().catch((e) => console.error("[mfd automations]", e));
  }, 300);
}

async function fallbackUserId() {
  const u = await db.user.findFirst({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true }, orderBy: { createdAt: "asc" } });
  return u?.id ?? null;
}

export async function processOutbox(limit = 50) {
  if (running) return { processed: 0, failed: 0 };
  running = true;
  let processed = 0;
  let failed = 0;
  try {
    const events = await db.ccOutboxEvent.findMany({ where: { state: "pending" }, orderBy: { createdAt: "asc" }, take: limit });
    for (const e of events) {
      // Claim this attempt; a concurrent processor that read the same row loses the race.
      const claim = await db.ccOutboxEvent.updateMany({ where: { id: e.id, state: "pending", retryCount: e.retryCount }, data: { retryCount: { increment: 1 } } });
      if (!claim.count) continue;
      const payload = (e.payloadJson ?? {}) as Rec;
      const userId = (typeof payload.actorUserId === "string" && payload.actorUserId) || (await fallbackUserId());
      const job = JOBS[e.eventType];
      let notices: Notice[] = [];
      let actor: Actor | null = null;
      try {
        if (job && userId) {
          actor = await systemActor(userId);
          const a = actor;
          notices = await db.$transaction((tx) => job(tx, a, e.aggregateId, payload), { timeout: 60000 });
        }
        await db.ccOutboxEvent.update({ where: { id: e.id }, data: { state: "published", publishedAt: new Date() } });
        processed++;
      } catch (err) {
        if (err instanceof HttpError) {
          // A business rule blocked the drafted work (e.g. the owner can't take new work):
          // tell the person who triggered it rather than retrying forever.
          await db.ccOutboxEvent.update({ where: { id: e.id }, data: { state: "published", publishedAt: new Date() } });
          notices = [{ userIds: [userId], code: "AUTOMATION", message: `Automation for ${e.eventType} couldn't run: ${err.message}`, href: "/consulting" }];
          processed++;
        } else {
          console.error(`[mfd automations] ${e.eventType} ${e.id}`, err);
          if (e.retryCount + 1 >= MAX_ATTEMPTS) await db.ccOutboxEvent.update({ where: { id: e.id }, data: { state: "failed" } });
          failed++;
          continue;
        }
      }
      await deliver(actor, notices).catch((err) => console.error("[mfd automations] deliver", err));
    }
  } finally {
    running = false;
  }
  return { processed, failed };
}

// ---------------------------------------------------------------- scheduled jobs

/** Records a once-only key; false when it was already used (GV-11 repeat window). */
async function claimKey(ws: string, type: string, key: string, aggregateId: string) {
  try {
    await db.ccOutboxEvent.create({
      data: { workspaceId: ws, eventType: type, aggregateId, payloadJson: {}, state: "published", publishedAt: new Date(), retryCount: 0, idempotencyKey: key },
    });
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return false;
    throw e;
  }
}

/** Business hours in India (09:00–19:00 IST, Mon–Sat) — reminders wait for them. */
function inBusinessHours(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const h = ist.getUTCHours();
  return ist.getUTCDay() !== 0 && h >= 9 && h < 19;
}

async function overdueTasks(ws: string): Promise<Notice[]> {
  if (!inBusinessHours()) return [];
  const tasks = await db.ccActionTask.findMany({
    where: { workspaceId: ws, archivedAt: null, dueAt: { lt: new Date() }, status: { notIn: ["completed", "cancelled"] } },
    select: { id: true, taskNumber: true, title: true, priority: true, assignedMemberId: true, engagementId: true, mfdOrgId: true },
    take: 500,
  });
  const notices: Notice[] = [];
  for (const t of tasks) {
    if (!(await claimKey(ws, "task.due_breached", `task.due_breached:${t.id}:${todayKey()}`, t.id))) continue;
    const escalate: string[] = [];
    if (t.priority === "high" || t.priority === "critical") {
      const owner = await ownerFor(db, ws, t.mfdOrgId, t.engagementId);
      if (owner && owner !== t.assignedMemberId) escalate.push(owner);
    }
    notices.push({ memberIds: [t.assignedMemberId, ...escalate], code: "AUT-05", message: `${t.taskNumber} is overdue: ${t.title}`, href: href("action_tasks", t.id) });
  }
  return notices;
}

async function monthClose(ws: string, actor: Actor): Promise<Notice[]> {
  const now = new Date();
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const ym = prevMonth.toISOString().slice(0, 7);
  const label = prevMonth.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const engagements = await db.ccConsultingEngagement.findMany({ where: { workspaceId: ws, archivedAt: null, contractStatus: "active" } });
  const notices: Notice[] = [];
  for (const e of engagements) {
    if (!(await claimKey(ws, "month.closed", `month.closed:${e.id}:${ym}`, e.id))) continue;
    try {
      await db.$transaction(async (tx) => {
        await task(tx, actor, {
          mfd_org_id: e.mfdOrgId,
          engagement_id: e.id,
          title: `Submit the KPI snapshot for ${label}`,
          assigned_member_id: e.leadConsultantId,
          acceptance_criteria: "Readings entered with sources; anything unavailable is left empty, not zero.",
          due_at: inDays(7),
          created_from: "automation:AUT-14",
        });
        await createIn(
          tx,
          actor,
          "review_reports",
          {
            mfd_org_id: e.mfdOrgId,
            engagement_id: e.id,
            review_type: "monthly",
            period_start: prevMonth.toISOString().slice(0, 10),
            period_end: thisMonth.toISOString().slice(0, 10),
            status: "draft",
            prepared_by_member_id: e.leadConsultantId,
          },
          { system: true }
        );
      });
      notices.push({ memberIds: [e.leadConsultantId], code: "AUT-14", message: `${label} closed for ${e.engagementName} — KPI snapshot requested and review drafted`, href: href("consulting_engagements", e.id) });
    } catch (err) {
      console.error("[mfd automations] month close", e.id, err);
    }
  }
  return notices;
}

async function renewals(ws: string, actor: Actor): Promise<Notice[]> {
  const engagements = await db.ccConsultingEngagement.findMany({ where: { workspaceId: ws, archivedAt: null, contractStatus: "active", endDate: { not: null } } });
  const notices: Notice[] = [];
  for (const e of engagements) {
    const end = e.endDate!.getTime();
    const notice = (e.renewalNoticeDays ?? 30) * DAY;
    if (Date.now() < end - notice) continue;
    const endKey = e.endDate!.toISOString().slice(0, 10);
    if (!(await claimKey(ws, "engagement.renewal_due", `engagement.renewal_due:${e.id}:${endKey}`, e.id))) continue;
    try {
      await db.$transaction((tx) =>
        task(tx, actor, {
          mfd_org_id: e.mfdOrgId,
          engagement_id: e.id,
          title: `Renewal review — ${e.engagementName} (ends ${endKey})`,
          priority: "high",
          assigned_member_id: e.leadConsultantId,
          due_at: new Date(Math.max(Date.now() + DAY, end - 7 * DAY)).toISOString(),
          created_from: "automation:AUT-16",
        })
      );
      const org = await db.ccMfdOrganization.findUnique({ where: { id: e.mfdOrgId }, select: { accountOwnerId: true } });
      notices.push({ memberIds: [e.leadConsultantId, org?.accountOwnerId], code: "AUT-16", message: `${e.engagementName} ends on ${endKey} — renewal review due`, href: href("consulting_engagements", e.id) });
    } catch (err) {
      console.error("[mfd automations] renewal", e.id, err);
    }
  }
  return notices;
}

/** Time-based automations + a sweep of the outbox. Safe to run as often as you like. */
export async function runScheduledAutomations() {
  const ws = await workspaceId();
  const userId = await fallbackUserId();
  const result: Record<string, number> = {};
  if (userId) {
    const actor = await systemActor(userId);
    const overdue = await overdueTasks(ws);
    const closes = await monthClose(ws, actor);
    const renew = await renewals(ws, actor);
    await deliver(actor, [...overdue, ...closes, ...renew]);
    Object.assign(result, { overdue: overdue.length, monthClose: closes.length, renewals: renew.length });
  }
  const outbox = await processOutbox(200);
  return { ...result, ...outbox };
}
