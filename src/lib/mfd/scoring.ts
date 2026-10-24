/**
 * Assessment completeness and scorecard calculation — pure functions so the
 * same answers + scoring scheme version always give the same score (AT-12).
 */

export interface QuestionLike {
  id: string;
  question_key: string;
  dimension: string;
  answer_type: string;
  required: boolean;
  options_json: unknown;
  visibility_rule_json: unknown;
  weight: string | null;
  status: string;
}

export interface AnswerLike {
  id: string;
  question_id: string;
  response_json: unknown;
  response_state: string;
  supersedes_answer_id: string | null;
  skip_reason: string | null;
}

export interface SchemeLike {
  rubric_json: unknown;
  weights_json: unknown;
}

interface Option {
  value: string;
  label: string;
  score?: number;
}

const options = (q: QuestionLike): Option[] => (Array.isArray(q.options_json) ? (q.options_json as Option[]) : []);

/** The current answer per question: not superseded by a later one, and not void. */
export function currentAnswers(answers: AnswerLike[]): Map<string, AnswerLike> {
  const superseded = new Set(answers.map((a) => a.supersedes_answer_id).filter(Boolean) as string[]);
  const out = new Map<string, AnswerLike>();
  for (const a of answers) if (!superseded.has(a.id) && a.response_state !== "void") out.set(a.question_id, a);
  return out;
}

/**
 * visibility_rule_json: {"question_key": "...", "equals": x} | {"in": [..]} | {"not_equals": x}.
 * No rule = always shown. A question hidden by its rule isn't eligible.
 */
export function isVisible(q: QuestionLike, byKey: Map<string, unknown>): boolean {
  const rule = q.visibility_rule_json as { question_key?: string; equals?: unknown; in?: unknown[]; not_equals?: unknown } | null;
  if (!rule || typeof rule !== "object" || !rule.question_key) return true;
  const v = byKey.get(rule.question_key);
  if ("equals" in rule) return JSON.stringify(v) === JSON.stringify(rule.equals);
  if (Array.isArray(rule.in)) return rule.in.some((x) => JSON.stringify(x) === JSON.stringify(v));
  if ("not_equals" in rule) return JSON.stringify(v) !== JSON.stringify(rule.not_equals);
  return true;
}

function responseValue(a: AnswerLike | undefined): unknown {
  const r = a?.response_json as { value?: unknown } | null | undefined;
  return r && typeof r === "object" && "value" in r ? r.value : undefined;
}

/** Validates a response against the question's answer type. Returns an error message or null. */
export function validateResponse(q: QuestionLike, value: unknown): string | null {
  const opts = options(q).map((o) => o.value);
  switch (q.answer_type) {
    case "single_select":
      return typeof value === "string" && opts.includes(value) ? null : "Choose one of the listed options.";
    case "multi_select":
      return Array.isArray(value) && value.every((v) => typeof v === "string" && opts.includes(v)) ? null : "Choose from the listed options.";
    case "boolean":
      return typeof value === "boolean" ? null : "Answer yes or no.";
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? null : "Enter a number.";
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : "Enter a date (YYYY-MM-DD).";
    case "short_text":
      return typeof value === "string" && value.trim().length > 0 && value.length <= 500 ? null : "Enter up to 500 characters.";
    case "long_text":
      return typeof value === "string" && value.trim().length > 0 && value.length <= 20000 ? null : "Enter up to 20,000 characters.";
    case "file":
      return typeof value === "string" && value.length > 0 ? null : "Attach a file.";
    default:
      return "Unsupported answer type.";
  }
}

function eligibleQuestions(questions: QuestionLike[], current: Map<string, AnswerLike>) {
  const byKey = new Map<string, unknown>();
  for (const q of questions) byKey.set(q.question_key, responseValue(current.get(q.id)));
  return questions.filter((q) => q.status === "active" && isVisible(q, byKey));
}

const isAnswered = (a: AnswerLike | undefined) => !!a && (responseValue(a) !== undefined || !!a.skip_reason);

export function completion(questions: QuestionLike[], answers: AnswerLike[]) {
  const current = currentAnswers(answers);
  const eligible = eligibleQuestions(questions, current);
  const answered = eligible.filter((q) => isAnswered(current.get(q.id))).length;
  return {
    response_count: answered,
    completion_pct: eligible.length ? Math.round((answered / eligible.length) * 10000) / 100 : 0,
    missingRequired: eligible.filter((q) => q.required && !isAnswered(current.get(q.id))).map((q) => q.question_key),
  };
}

function scale(scheme: SchemeLike) {
  const s = (scheme.rubric_json as { scale?: { min?: number; max?: number } } | null)?.scale;
  return { min: typeof s?.min === "number" ? s.min : 1, max: typeof s?.max === "number" ? s.max : 5 };
}

/** Score of one answer on the scheme's scale, or null when the question isn't scorable / was skipped. */
export function scoreAnswer(q: QuestionLike, a: AnswerLike | undefined, scheme: SchemeLike): number | null {
  const v = responseValue(a);
  if (v === undefined) return null;
  const { min, max } = scale(scheme);
  const scoreOf = (val: unknown) => options(q).find((o) => o.value === val)?.score;
  switch (q.answer_type) {
    case "single_select": {
      const s = scoreOf(v);
      return typeof s === "number" ? s : null;
    }
    case "multi_select": {
      const s = (v as unknown[]).map(scoreOf).filter((x): x is number => typeof x === "number");
      return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
    }
    case "boolean":
      return v ? max : min;
    default:
      return null;
  }
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export interface DimensionScore {
  dimension: string;
  answers_eligible: number;
  answers_count: number;
  raw_score: number | null;
  normalized_score: number | null;
  coverage_pct: number | null;
  evidence_count: number;
}

export function computeScorecard(
  questions: QuestionLike[],
  answers: AnswerLike[],
  scheme: SchemeLike,
  evidenceAnswerIds: Set<string>,
  scorecardType: string
) {
  const current = currentAnswers(answers);
  const eligible = eligibleQuestions(questions, current).filter((q) => ["single_select", "multi_select", "boolean"].includes(q.answer_type));
  const { min, max } = scale(scheme);
  const weights = (scheme.weights_json ?? {}) as Record<string, number>;

  const dims = [...new Set(eligible.map((q) => q.dimension))].sort();
  const dimensions: DimensionScore[] = dims.map((dimension) => {
    const qs = eligible.filter((q) => q.dimension === dimension);
    let wsum = 0;
    let total = 0;
    let count = 0;
    let evidence = 0;
    for (const q of qs) {
      const a = current.get(q.id);
      const s = scoreAnswer(q, a, scheme);
      if (s === null) continue;
      const w = q.weight === null ? 1 : Number(q.weight);
      total += s * w;
      wsum += w;
      count++;
      if (a && evidenceAnswerIds.has(a.id)) evidence++;
    }
    const raw = wsum > 0 ? total / wsum : null;
    return {
      dimension,
      answers_eligible: qs.length,
      answers_count: count,
      raw_score: raw === null ? null : round(raw, 4),
      normalized_score: raw === null ? null : round(((raw - min) / (max - min || 1)) * 100, 4),
      coverage_pct: qs.length ? round((count / qs.length) * 100, 2) : null,
      evidence_count: evidence,
    };
  });

  const scored = dimensions.filter((d) => d.raw_score !== null);
  const wOf = (d: string) => (typeof weights[d] === "number" ? weights[d] : 1);
  const wTotal = scored.reduce((n, d) => n + wOf(d.dimension), 0);
  const score = wTotal > 0 ? scored.reduce((n, d) => n + d.raw_score! * wOf(d.dimension), 0) / wTotal : null;
  const eligibleCount = dimensions.reduce((n, d) => n + d.answers_eligible, 0);
  const answeredCount = dimensions.reduce((n, d) => n + d.answers_count, 0);
  const evidenceCount = dimensions.reduce((n, d) => n + d.evidence_count, 0);
  const normalized = score === null ? null : ((score - min) / (max - min || 1)) * 100;

  return {
    dimensions,
    score_value: score === null ? null : round(score, 4),
    coverage_pct: eligibleCount ? round((answeredCount / eligibleCount) * 100, 2) : null,
    evidence_coverage_pct: answeredCount ? round((evidenceCount / answeredCount) * 100, 2) : null,
    // SCR-02: a maturity level (1–5) only for maturity scorecards.
    maturity_level: scorecardType === "maturity" && normalized !== null ? String(Math.min(5, Math.max(1, 1 + Math.round(normalized / 25)))) : null,
  };
}
