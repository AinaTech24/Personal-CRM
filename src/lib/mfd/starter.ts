/**
 * Starter content from the Aina MFD Consulting Kit: the maturity scoring
 * scheme and the AINA Business Diagnostic template (the kit's "7 Functions"
 * and "10 Systems" audits — 65 checkpoints, each scored 1–5 on the kit's
 * maturity ladder). Created through the normal engine, so it's audited and
 * versioned like anything a consultant builds, and published so it can be
 * issued straight away. Safe to run more than once.
 */
import { db } from "@/lib/db";
import type { Actor } from "./access";
import { publishScheme, publishTemplate } from "./actions";
import { createIn } from "./engine";

export const MATURITY_LEVELS = [
  { value: "1", label: "1 — Founder dependent / not in place", score: 1 },
  { value: "2", label: "2 — Partly documented", score: 2 },
  { value: "3", label: "3 — Process driven", score: 3 },
  { value: "4", label: "4 — Measured", score: 4 },
  { value: "5", label: "5 — Technology-enabled & continuously improving", score: 5 },
];

const g = (key: string, label: string, dimension: string, required: boolean, items: string[]) => ({ key, label, dimension, required, items });

/** The kit's diagnostic workbook ("7 Functions Audit" + "10 Systems Audit"), mapped to the spec's assessment dimensions. */
export const AINA_DIAGNOSTIC = [
  g("F-MKT", "Marketing", "marketing", true, [
    "Defined target segment / ideal client profile",
    "Lead generation sources documented and measured",
    "Referral process exists and is consistently used",
    "Branding / digital activity has calendar and attribution",
    "Lead capture moves into a controlled prospect system",
  ]),
  g("F-SAL", "Sales", "sales", true, [
    "Lead qualification criteria are defined",
    "Pre-sales preparation and meeting process are standardized",
    "Every lead has next action / follow-up visibility",
    "Conversion ratio and conversion time are measured",
    "Proposal/plan handover to operations is controlled",
  ]),
  g("F-OPS", "Operations", "operations", true, [
    "Client onboarding has checklist and owner",
    "Service tasks are centrally tracked",
    "Financial/business transactions are separately tracked",
    "TAT / escalation / exception process exists",
    "Query / complaint / rework is measured",
  ]),
  g("F-LEG", "Legal / Compliance", "legal_protection", true, [
    "Compliance calendar exists and is owned",
    "Client/employee/vendor documents are controlled",
    "Evidence/audit trail is retained",
    "Data access is permissioned and reviewable",
    "Regulatory interpretations have current validation",
  ]),
  g("F-ACC", "Accounts", "accounts", true, [
    "Revenue/brokerage reconciliation is systematic",
    "Expenses and budgets are reviewed",
    "Receivables/payables have visibility",
    "Monthly management reporting is timely",
    "Financial close / statutory support process is defined",
  ]),
  g("F-HR", "HR", "hr", true, [
    "Organization structure and reporting lines are clear",
    "JD/JR and competency requirements are documented",
    "Recruitment and onboarding are standardized",
    "Training plan and learning records exist",
    "KRA/KPI and performance review rhythm exist",
  ]),
  g("F-MGT", "Management", "management", true, [
    "Annual priorities / goals are documented",
    "Weekly/monthly functional review cadence exists",
    "MIS is timely, accurate and decision-oriented",
    "Owner dependency is measured and reduced",
    "Projects and process improvements are governed",
  ]),
  g("S-MGT", "Strategic Direction / Management system", "management", false, [
    "Vision/mission/values articulated",
    "Annual/quarterly priorities documented",
    "Management reviews drive decisions",
  ]),
  g("S-LGS", "Lead Generation system", "marketing", false, ["Lead sources defined", "Campaign/referral/event process standardized", "Lead-source performance measured"]),
  g("S-LCS", "Lead Conversion system", "sales", false, ["Pipeline stages defined", "Follow-up discipline visible", "Conversion ratio/time measured"]),
  g("S-CMS", "Client Management system", "client_service", false, ["Client data centralized", "Service workflows standardized", "Reminders/communications tracked"]),
  g("S-RMS", "Review Management system", "client_service", false, ["Client segmentation defined", "Review calendar visible", "Pre/during/post review workflow documented"]),
  g("S-ACC", "Accounting system", "accounts", false, ["Revenue reconciled", "Expenses/budget controlled", "Management reporting available"]),
  g("S-HR", "HR system", "hr", false, ["Recruitment/induction standardized", "Training and performance managed", "Backup/succession considered"]),
  g("S-CMP", "Compliance system", "compliance", false, ["Calendar/owner exists", "Approvals/evidence retained", "Review dates current"]),
  g("S-RND", "R&D / Improvement system", "management", false, ["Breakdowns/breakthroughs captured", "Projects governed", "SOPs updated from learning"]),
  g("S-IT", "IT / Technology support", "technology", false, [
    "Systems/access documented",
    "Backups/security/support defined",
    "Automation and dashboards maintained",
  ]),
];

const SCHEME_CODE = "AINA-MATURITY";
const TEMPLATE_CODE = "AINA-DIAG";

/** Makes sure the calling admin has a team_members row (templates and tasks need an owner). */
export async function ensureTeamMember(actor: Actor): Promise<string> {
  if (actor.memberId) return actor.memberId;
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true, surname: true, email: true, mobile: true, designation: true } });
  const m = await db.$transaction((tx) =>
    createIn(
      tx,
      actor,
      "team_members",
      {
        auth_user_id: actor.userId,
        employee_code: `AINA-${actor.userId.slice(-6).toUpperCase()}`,
        full_name: [user.name, user.surname].filter(Boolean).join(" "),
        work_email: user.email,
        job_title: user.designation ?? null,
        status: "active",
        is_available_for_assignment: true,
      },
      { system: true }
    )
  );
  actor.memberId = m.id as string;
  return actor.memberId;
}

export async function installStarterContent(actor: Actor) {
  const memberId = await ensureTeamMember(actor);
  const created: string[] = [];

  let scheme = await db.ccScoringScheme.findFirst({ where: { workspaceId: actor.workspaceId, schemeCode: SCHEME_CODE }, orderBy: { version: "desc" } });
  if (!scheme) {
    const s = await db.$transaction((tx) =>
      createIn(tx, actor, "scoring_schemes", {
        scheme_code: SCHEME_CODE,
        rubric_json: { scale: { min: 1, max: 5 }, levels: MATURITY_LEVELS.map((l) => ({ score: l.score, label: l.label })) },
        weights_json: { management: 1, marketing: 1, sales: 1, operations: 1, legal_protection: 1, accounts: 1, hr: 1, client_service: 1, compliance: 1, technology: 1 },
        status: "draft",
      })
    );
    await publishScheme(actor, s.id as string);
    scheme = await db.ccScoringScheme.findUniqueOrThrow({ where: { id: s.id as string } });
    created.push(`scoring scheme ${SCHEME_CODE} v1`);
  }

  const existing = await db.ccAssessmentTemplate.findFirst({ where: { workspaceId: actor.workspaceId, templateCode: TEMPLATE_CODE }, select: { id: true } });
  if (!existing) {
    const tpl = await db.$transaction(
      async (tx) => {
        const t = await createIn(tx, actor, "assessment_templates", {
          template_code: TEMPLATE_CODE,
          template_name: "AINA Business Diagnostic — 7 Functions + 10 Systems",
          assessment_type: "initial_diagnostic",
          description: "The Aina MFD Consulting Kit diagnostic. Score each checkpoint 1–5 on the maturity ladder; attach evidence to answers where you have it.",
          status: "draft",
          scoring_scheme_code: SCHEME_CODE,
          scoring_scheme_version: scheme!.version,
          owner_member_id: memberId,
          is_client_specific: false,
        });
        let order = 1;
        for (const grp of AINA_DIAGNOSTIC) {
          for (const [i, text] of grp.items.entries()) {
            await createIn(tx, actor, "assessment_questions", {
              template_id: t.id,
              question_key: `${grp.key}-${i + 1}`,
              section_name: grp.label,
              dimension: grp.dimension,
              question_text: text,
              answer_type: "single_select",
              required: grp.required,
              options_json: MATURITY_LEVELS,
              weight: "1",
              order_no: order++,
              status: "active",
            });
          }
        }
        return t;
      },
      { timeout: 60000 }
    );
    await publishTemplate(actor, tpl.id as string, {});
    created.push(`template ${TEMPLATE_CODE} v1 (${AINA_DIAGNOSTIC.reduce((n, x) => n + x.items.length, 0)} questions)`);
  }
  return { created };
}
