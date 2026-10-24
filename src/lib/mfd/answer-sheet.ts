import { db } from "@/lib/db";
import type { ConsoleAnswer, ConsoleQuestion } from "@/components/consulting/assessment-console";
import { currentAnswers } from "./scoring";
import { findRecs } from "./store";
import type { Rec } from "./values";

/**
 * Questions and current answers for an assessment's answer sheet. With
 * `forRespondent`, option scores are stripped — the client sees the choices,
 * not how they're weighted.
 */
export async function loadAnswerSheet(asm: Rec, forRespondent = false) {
  const raw = await findRecs(db, "assessment_questions", { template_id: asm.template_id });
  const questions: ConsoleQuestion[] = raw
    .sort((a, b) => (a.order_no as number) - (b.order_no as number))
    .map((q) => ({
      id: q.id as string,
      question_key: q.question_key as string,
      section_name: q.section_name as string,
      dimension: q.dimension as string,
      question_text: q.question_text as string,
      answer_type: q.answer_type as string,
      required: !!q.required,
      options_json: forRespondent && Array.isArray(q.options_json) ? (q.options_json as { value: string; label: string }[]).map((o) => ({ value: o.value, label: o.label })) : q.options_json,
      visibility_rule_json: q.visibility_rule_json,
      status: q.status as string,
    }));
  const all = await findRecs(db, "assessment_answers", { assessment_id: asm.id });
  all.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const current = currentAnswers(
    all.map((a) => ({
      id: a.id as string,
      question_id: a.question_id as string,
      response_json: a.response_json,
      response_state: a.response_state as string,
      supersedes_answer_id: (a.supersedes_answer_id as string | null) ?? null,
      skip_reason: (a.skip_reason as string | null) ?? null,
    }))
  );
  const answers: Record<string, ConsoleAnswer> = {};
  for (const [qid, a] of current) {
    const r = a.response_json as { value?: unknown } | null;
    answers[qid] = { value: r?.value ?? null, skip_reason: a.skip_reason, state: a.response_state, history: all.filter((x) => x.question_id === qid).length };
  }
  return { questions, answers };
}
