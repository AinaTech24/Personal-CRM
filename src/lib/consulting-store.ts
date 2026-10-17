import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageModule } from "@/lib/module-permissions-store";
import type { ModuleAction } from "@/lib/module-permissions";
import { dateFromKey, istDateKey, keyFromDate } from "@/lib/attendance";
import { emitToAdmins, emitToUser } from "@/lib/socket-emit";
import type {
  ConsultingAssessment,
  ConsultingEngagement,
  ConsultingRegisterItem,
  ConsultingStage,
  Prisma,
} from "@/generated/prisma/client";
import {
  CHECKLISTS,
  ENGAGEMENT_STATUSES,
  FUNCTION_AUDIT,
  LIFECYCLE_STAGES,
  MATURITY_AREAS,
  OWNER_DEPENDENCY_FUNCTIONS,
  PRIORITIES,
  QUALIFICATION_CRITERIA,
  REGISTER_KIND_DEFS,
  REGISTER_KINDS,
  STAGE_STATUSES,
  SYSTEMIZATION_CRITERIA,
  SYSTEMIZATION_PROCESSES,
  SYSTEMS_AUDIT,
  currentStage,
  isOpenItem,
  isOverdue,
  lifecycleProgress,
  qualification,
  riskScore,
  type AssessmentData,
  type ChecklistState,
  type QualificationScores,
  type RegisterKind,
} from "@/lib/consulting";

// ---------- Access ----------

/**
 * The signed-in user, if they may perform `action` on the Consulting
 * module (a company Admin, or someone granted it in the Permission
 * Manager) — otherwise the ready-made 401/403 response to return.
 */
export async function consultingUser(action: ModuleAction) {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!(await canManageModule(user, "CONSULTING", action))) {
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { user, error: null } as const;
}

/**
 * Everyone who can see the module: admins (one room) plus each individual
 * grant holder. Consulting data never goes to the wider company.
 */
export async function broadcastConsultingChange(engagementId: string) {
  emitToAdmins("consulting_changed", { engagementId });
  const grants = await db.userModulePermission.findMany({
    where: { module: "CONSULTING", canRead: true },
    select: { userId: true },
  });
  for (const g of grants) emitToUser(g.userId, "consulting_changed", { engagementId });
}

// ---------- Shared zod pieces ----------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

// zod still runs a refine after its regex fails, so the refine must not
// assume a well-formed key — toISOString() throws on an Invalid Date.
const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => {
    const d = dateFromKey(v);
    return !Number.isNaN(d.getTime()) && keyFromDate(d) === v;
  }, "Invalid date");

const optionalDate = z
  .union([z.literal(""), z.null(), dateKey])
  .optional()
  .transform((v) => (v ? v : null));

/** Rendered as a link, so only http(s) — a `javascript:` URL here would be stored XSS. */
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Links must start with http:// or https://");

const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();
const optionalDecimal = z.number().min(0).max(1e12).nullable().optional();

/** zod has already validated the shape; this only satisfies Prisma's Json column input type. */
export const toJson = (value: unknown) => value as Prisma.InputJsonValue;

const toDate = (key: string | null | undefined) => (key ? dateFromKey(key) : null);
const fromDate = (d: Date | null) => (d ? keyFromDate(d) : null);

// ---------- Engagements ----------

const qualificationShape = Object.fromEntries(QUALIFICATION_CRITERIA.map((c) => [c.key, optionalInt(0, 2)])) as Record<
  (typeof QUALIFICATION_CRITERIA)[number]["key"],
  ReturnType<typeof optionalInt>
>;

const checklistsSchema = z
  .record(z.string(), z.record(z.string(), z.boolean()))
  .nullable()
  .optional()
  .transform((v) => {
    if (!v) return null;
    // Keep only catalogued checklists/items, so the column can't accumulate arbitrary keys.
    const clean: ChecklistState = {};
    for (const def of CHECKLISTS) {
      const items = v[def.key];
      if (!items) continue;
      clean[def.key] = Object.fromEntries(def.items.filter((i) => items[i.key] !== undefined).map((i) => [i.key, items[i.key]]));
    }
    return clean;
  });

export const engagementBodySchema = z.object({
  firmName: z.string().trim().min(1, "Firm name is required").max(200),
  contactPerson: optionalText(200),
  contactEmail: optionalText(200).refine((v) => v === null || z.email().safeParse(v).success, "Invalid email"),
  contactPhone: optionalText(40),
  city: optionalText(120),
  entityType: optionalText(200),
  yearsInBusiness: optionalInt(0, 200),
  aumCrore: optionalDecimal,
  monthlySipLakh: optionalDecimal,
  families: optionalInt(0, 10_000_000),
  teamSize: optionalInt(0, 100_000),
  branches: optionalInt(0, 10_000),
  products: optionalText(2000),
  currentTools: optionalText(2000),
  leadSource: optionalText(200),
  primaryPainPoint: optionalText(4000),
  whyNow: optionalText(4000),
  decisionMaker: optionalText(200),
  budgetReadiness: optionalText(200),
  ownerTimeCommitment: optionalText(200),
  preferredStart: optionalDate,
  ...qualificationShape,
  status: z.enum(ENGAGEMENT_STATUSES).optional(),
  executiveSponsor: optionalText(200),
  programOwner: optionalText(200),
  leadConsultantId: z.string().min(1).nullable().optional(),
  startDate: optionalDate,
  contractEndDate: optionalDate,
  weeklyReviewDay: optionalText(40),
  monthlyReviewDay: optionalText(40),
  repositoryLink: optionalUrl,
  primaryGoals: optionalText(4000),
  notes: optionalText(8000),
  checklists: checklistsSchema,
});

export const engagementPatchSchema = engagementBodySchema.partial();
export type EngagementBody = z.infer<typeof engagementBodySchema>;

/** Prisma data for the fields present in a (possibly partial) body — absent keys stay untouched on update. */
export function engagementData(b: Partial<EngagementBody>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    if (k === "preferredStart" || k === "startDate" || k === "contractEndDate") out[k] = toDate(v as string | null);
    else if (k === "checklists") out[k] = v ?? undefined;
    else out[k] = v;
  }
  return out as Prisma.ConsultingEngagementUncheckedUpdateInput;
}

export async function assertActiveUser(userId: string | null | undefined) {
  if (!userId) return true;
  const u = await db.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } });
  return !!u;
}

const userSelect = { select: { id: true, name: true, surname: true } } as const;
const fullName = (u: { name: string; surname: string | null } | null) => (u ? [u.name, u.surname].filter(Boolean).join(" ") : null);

export const engagementInclude = {
  leadConsultant: userSelect,
  stages: { include: { owner: userSelect }, orderBy: { stage: "asc" } },
} as const satisfies Prisma.ConsultingEngagementInclude;

type EngagementWithStages = ConsultingEngagement & {
  leadConsultant: { id: string; name: string; surname: string | null } | null;
  stages: (ConsultingStage & { owner: { id: string; name: string; surname: string | null } | null })[];
};

function qualificationOf(e: ConsultingEngagement): QualificationScores {
  return Object.fromEntries(QUALIFICATION_CRITERIA.map((c) => [c.key, e[c.key]])) as QualificationScores;
}

export function serializeStage(s: ConsultingStage & { owner: { id: string; name: string; surname: string | null } | null }) {
  return {
    stage: s.stage,
    status: s.status,
    owner: s.owner ? { id: s.owner.id, name: fullName(s.owner) } : null,
    plannedStart: fromDate(s.plannedStart),
    plannedEnd: fromDate(s.plannedEnd),
    actualEnd: fromDate(s.actualEnd),
    percentComplete: s.percentComplete,
    notes: s.notes,
  };
}

export function serializeEngagement(e: EngagementWithStages) {
  const scores = qualificationOf(e);
  return {
    id: e.id,
    firmName: e.firmName,
    contactPerson: e.contactPerson,
    contactEmail: e.contactEmail,
    contactPhone: e.contactPhone,
    city: e.city,
    entityType: e.entityType,
    yearsInBusiness: e.yearsInBusiness,
    aumCrore: e.aumCrore === null ? null : Number(e.aumCrore),
    monthlySipLakh: e.monthlySipLakh === null ? null : Number(e.monthlySipLakh),
    families: e.families,
    teamSize: e.teamSize,
    branches: e.branches,
    products: e.products,
    currentTools: e.currentTools,
    leadSource: e.leadSource,
    primaryPainPoint: e.primaryPainPoint,
    whyNow: e.whyNow,
    decisionMaker: e.decisionMaker,
    budgetReadiness: e.budgetReadiness,
    ownerTimeCommitment: e.ownerTimeCommitment,
    preferredStart: fromDate(e.preferredStart),
    ...scores,
    qualification: qualification(scores),
    status: e.status,
    executiveSponsor: e.executiveSponsor,
    programOwner: e.programOwner,
    leadConsultant: e.leadConsultant ? { id: e.leadConsultant.id, name: fullName(e.leadConsultant) } : null,
    startDate: fromDate(e.startDate),
    contractEndDate: fromDate(e.contractEndDate),
    weeklyReviewDay: e.weeklyReviewDay,
    monthlyReviewDay: e.monthlyReviewDay,
    repositoryLink: e.repositoryLink,
    primaryGoals: e.primaryGoals,
    notes: e.notes,
    checklists: (e.checklists ?? {}) as ChecklistState,
    stages: e.stages.map(serializeStage),
    currentStage: currentStage(e.stages),
    progress: lifecycleProgress(e.stages),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** Every new engagement starts with all 18 lifecycle stages, so the tracker is complete from day one. */
export function initialStages() {
  return { create: LIFECYCLE_STAGES.map((s) => ({ stage: s.stage })) };
}

/** Portfolio-level health per engagement, for the list page — the Control Center's "Overview" sheet. */
export async function engagementHealth(engagementIds: string[]) {
  if (engagementIds.length === 0) return new Map<string, EngagementHealth>();
  const items = await db.consultingRegisterItem.findMany({
    where: { engagementId: { in: engagementIds }, kind: { in: ["ACTION", "RISK", "ISSUE", "DELIVERABLE", "MEETING"] } },
    select: { engagementId: true, kind: true, status: true, dueDate: true, details: true },
  });
  const today = istDateKey();
  const map = new Map<string, EngagementHealth>();
  for (const id of engagementIds) {
    map.set(id, { openActions: 0, overdueActions: 0, openRisks: 0, highRisks: 0, openIssues: 0, approvedDeliverables: 0, nextMeeting: null });
  }
  for (const it of items) {
    const h = map.get(it.engagementId)!;
    const kind = it.kind as RegisterKind;
    const open = isOpenItem(kind, it.status);
    const due = fromDate(it.dueDate);
    if (kind === "ACTION" && open) {
      h.openActions++;
      if (isOverdue({ kind, status: it.status, dueDate: due }, today)) h.overdueActions++;
    }
    if (kind === "RISK" && open) {
      h.openRisks++;
      if ((riskScore(it.details as Record<string, unknown>) ?? 0) >= 15) h.highRisks++;
    }
    if (kind === "ISSUE" && open) h.openIssues++;
    if (kind === "DELIVERABLE" && it.status === "APPROVED") h.approvedDeliverables++;
    if (kind === "MEETING" && it.status === "SCHEDULED" && due && due >= today && (!h.nextMeeting || due < h.nextMeeting)) {
      h.nextMeeting = due;
    }
  }
  return map;
}

export interface EngagementHealth {
  openActions: number;
  overdueActions: number;
  openRisks: number;
  /** Probability × impact ≥ 15 on the 1–25 scale. */
  highRisks: number;
  openIssues: number;
  approvedDeliverables: number;
  nextMeeting: string | null;
}

// ---------- Stages ----------

// .partial() matters here: the optional* helpers map a missing value to
// null (right for create), but on a PATCH an omitted key must stay
// undefined or it would clear a field the client never sent.
export const stagePatchSchema = z
  .object({
    status: z.enum(STAGE_STATUSES),
    ownerId: z.string().min(1).nullable(),
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    actualEnd: optionalDate,
    percentComplete: z.number().int().min(0).max(100),
    notes: optionalText(4000),
  })
  .partial();

// ---------- Register items ----------

/** zod for one kind's `details`, built from its field catalog; unknown keys are dropped and empty values omitted. */
function detailsSchema(kind: RegisterKind) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of REGISTER_KIND_DEFS[kind].details) {
    switch (f.type) {
      case "text":
        shape[f.key] = z.string().trim().max(500);
        break;
      case "textarea":
        shape[f.key] = z.string().trim().max(8000);
        break;
      case "url":
        shape[f.key] = z
          .string()
          .trim()
          .max(2000)
          .refine((v) => v === "" || /^https?:\/\//i.test(v), "Links must start with http:// or https://");
        break;
      case "date":
        shape[f.key] = z.union([dateKey, z.literal("")]);
        break;
      case "number":
        shape[f.key] = z.number().min(f.min ?? -1e12).max(f.max ?? 1e12);
        break;
      case "select":
        shape[f.key] = z.enum((f.options ?? []).map((o) => o.value) as [string, ...string[]]).or(z.literal(""));
        break;
    }
  }
  return z
    .object(Object.fromEntries(Object.entries(shape).map(([k, s]) => [k, s.nullable().optional()])))
    .transform((d) => Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== "")));
}

const itemCommon = {
  title: z.string().trim().min(1, "Required").max(500),
  description: optionalText(20_000),
  status: z.string().min(1).max(32),
  priority: z.enum(PRIORITIES).nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  ownerName: optionalText(200),
  dueDate: optionalDate,
  details: z.record(z.string(), z.unknown()).nullable().optional(),
};

export const itemBodySchema = z.object({ kind: z.enum(REGISTER_KINDS), ...itemCommon });
export const itemPatchSchema = z.object(itemCommon).partial();

/** Validates status and details against the kind's catalog. Returns an error message, or the cleaned details. */
export function validateItemForKind(kind: RegisterKind, status: string | undefined, details: unknown) {
  const def = REGISTER_KIND_DEFS[kind];
  if (status !== undefined && !def.statuses.some((s) => s.value === status)) {
    return { error: `Invalid status for ${def.label.toLowerCase()}` } as const;
  }
  if (details === undefined) return { details: undefined } as const;
  const parsed = detailsSchema(kind).safeParse(details ?? {});
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid details" } as const;
  return { details: parsed.data } as const;
}

/** Status moving into / out of a closed state stamps / clears closedAt. */
export function closedAtFor(kind: RegisterKind, status: string, previous: Date | null) {
  if (!isOpenItem(kind, status)) return previous ?? new Date();
  return null;
}

/**
 * Creates an item with the next per-engagement, per-kind number. The unique
 * index makes a concurrent collision fail rather than duplicate, and the
 * retry picks the next free number.
 */
export async function createItemWithNumber(data: Omit<Prisma.ConsultingRegisterItemUncheckedCreateInput, "number">) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const last = await db.consultingRegisterItem.findFirst({
      where: { engagementId: data.engagementId, kind: data.kind },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    try {
      return await db.consultingRegisterItem.create({ data: { ...data, number: (last?.number ?? 0) + 1 }, include: itemInclude });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002" || attempt === 3) throw err;
    }
  }
  throw new Error("unreachable");
}

export const itemInclude = { owner: userSelect } as const satisfies Prisma.ConsultingRegisterItemInclude;

export function serializeItem(i: ConsultingRegisterItem & { owner: { id: string; name: string; surname: string | null } | null }) {
  return {
    id: i.id,
    engagementId: i.engagementId,
    kind: i.kind as RegisterKind,
    number: i.number,
    title: i.title,
    description: i.description,
    status: i.status,
    priority: i.priority,
    owner: i.owner ? { id: i.owner.id, name: fullName(i.owner) } : null,
    ownerName: i.ownerName,
    dueDate: fromDate(i.dueDate),
    closedAt: i.closedAt?.toISOString() ?? null,
    details: (i.details ?? {}) as Record<string, unknown>,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  };
}

// ---------- Assessments ----------

const knownCheckpoints = new Set([...FUNCTION_AUDIT, ...SYSTEMS_AUDIT].flatMap((g) => g.checkpoints.map((c) => c.key)));
const knownAreas = new Set(MATURITY_AREAS.map((a) => a.key));
const knownFunctions = new Set(OWNER_DEPENDENCY_FUNCTIONS.map((f) => f.key));
const knownProcesses = new Set(SYSTEMIZATION_PROCESSES.map((p) => p.key));

const pick = <T>(rec: Record<string, T> | undefined, allowed: Set<string>) =>
  Object.fromEntries(Object.entries(rec ?? {}).filter(([k]) => allowed.has(k)));

const assessmentDataSchema = z
  .object({
    checkpoints: z
      .record(
        z.string(),
        z.object({
          score: z.number().int().min(1).max(5).nullable().optional(),
          evidence: z.string().max(4000).optional(),
          priority: z.enum(["", "LOW", "MEDIUM", "HIGH"]).optional(),
          owner: z.string().max(200).optional(),
          recommendation: z.string().max(4000).optional(),
        })
      )
      .optional(),
    targets: z.record(z.string(), z.number().min(1).max(5)).optional(),
    ownerDependency: z
      .record(
        z.string(),
        z.object({
          activities: z.string().max(4000).optional(),
          total: z.number().int().min(0).max(1000).nullable().optional(),
          dependent: z.number().int().min(0).max(1000).nullable().optional(),
          target: z.number().min(0).max(1).nullable().optional(),
          actions: z.string().max(4000).optional(),
        })
      )
      .optional(),
    systemization: z
      .record(
        z.string(),
        z.object({
          ...Object.fromEntries(SYSTEMIZATION_CRITERIA.map((c) => [c.key, z.boolean().optional()])),
          next: z.string().max(2000).optional(),
        })
      )
      .optional(),
  })
  .transform(
    (d): AssessmentData => ({
      checkpoints: pick(d.checkpoints, knownCheckpoints),
      targets: pick(d.targets, knownAreas),
      ownerDependency: pick(d.ownerDependency, knownFunctions),
      systemization: pick(d.systemization, knownProcesses),
    })
  );

export const assessmentBodySchema = z.object({
  label: z.string().trim().min(1).max(200),
  assessedOn: dateKey,
  data: assessmentDataSchema.optional(),
});

export const assessmentPatchSchema = assessmentBodySchema.partial();

export function serializeAssessment(a: ConsultingAssessment) {
  return {
    id: a.id,
    engagementId: a.engagementId,
    label: a.label,
    assessedOn: keyFromDate(a.assessedOn),
    data: (a.data ?? {}) as AssessmentData,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
