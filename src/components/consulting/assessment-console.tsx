"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/providers/toast-provider";
import { isVisible, type QuestionLike } from "@/lib/mfd/scoring";

export interface ConsoleQuestion {
  id: string;
  question_key: string;
  section_name: string;
  dimension: string;
  question_text: string;
  answer_type: string;
  required: boolean;
  options_json: unknown;
  visibility_rule_json: unknown;
  status: string;
}

export interface ConsoleAnswer {
  value: unknown;
  skip_reason: string | null;
  state: string;
  history: number;
}

interface Option {
  value: string;
  label: string;
}

/**
 * Respondent / consultant answer sheet for an assessment. Each save appends
 * an answer row (the server keeps every earlier one); once submitted, a
 * change is a correction and asks for a reason (AT-11).
 */
export function AssessmentConsole({
  assessmentId,
  canAnswer,
  questions,
  answers,
  endpoint,
  respondentView = false,
}: {
  assessmentId: string;
  canAnswer: boolean;
  questions: ConsoleQuestion[];
  answers: Record<string, ConsoleAnswer>;
  /** Where answers are posted; defaults to the signed-in answer action. Extra fields are merged into each body. */
  endpoint?: { url: string; extra?: Record<string, unknown> };
  /** The client respondent's view: no internal keys or version counts. */
  respondentView?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const byKey = useMemo(() => {
    const m = new Map<string, unknown>();
    for (const q of questions) m.set(q.question_key, answers[q.id]?.value);
    return m;
  }, [questions, answers]);

  const sections = useMemo(() => {
    const out: { name: string; items: ConsoleQuestion[] }[] = [];
    for (const q of questions) {
      if (q.status !== "active") continue;
      if (!isVisible({ ...q, weight: null } as QuestionLike, byKey)) continue;
      let s = out.find((x) => x.name === q.section_name);
      if (!s) out.push((s = { name: q.section_name, items: [] }));
      s.items.push(q);
    }
    return out;
  }, [questions, byKey]);

  async function save(q: ConsoleQuestion, payload: { value?: unknown; skip_reason?: string }) {
    const prev = answers[q.id];
    let reason: string | undefined;
    if (prev && (prev.state === "submitted" || prev.state === "corrected")) {
      const r = window.prompt("This answer was already submitted. Why is it being corrected?");
      if (!r?.trim()) return;
      reason = r.trim();
    }
    setBusy(q.id);
    try {
      const res = await fetch(endpoint?.url ?? `/api/v1/assessments/${assessmentId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(endpoint?.extra ?? {}), question_id: q.id, ...payload, ...(reason ? { reason } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(data.error ?? "Couldn't save the answer");
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const answered = questions.filter((q) => answers[q.id]).length;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {answered} of {questions.filter((q) => q.status === "active").length} answered.{" "}
        {canAnswer ? "Answers save as you go." : "Answers can be changed while the assessment is issued, in progress or reopened."}
      </p>
      {sections.map((s) => (
        <section key={s.name} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{s.name}</h3>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {s.items.map((q) => {
              const a = answers[q.id];
              const opts: Option[] = Array.isArray(q.options_json) ? (q.options_json as Option[]) : [];
              const disabled = !canAnswer || busy === q.id;
              const draft = drafts[q.id] ?? (a?.value === undefined || a?.value === null ? "" : String(a.value));
              return (
                <div key={q.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {q.question_text}
                      {q.required && <span className="text-destructive"> *</span>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {!respondentView && <span>{q.question_key}</span>}
                      {a?.state && a.state !== "draft" && <Badge variant={a.state === "corrected" ? "warning" : "secondary"}>{a.state}</Badge>}
                      {!respondentView && a && a.history > 1 && <span>{a.history} versions kept</span>}
                      {a?.skip_reason && <span>Skipped: {a.skip_reason}</span>}
                    </p>
                  </div>
                  <div className="w-full sm:w-72">
                    {q.answer_type === "single_select" ? (
                      <select
                        disabled={disabled}
                        value={typeof a?.value === "string" ? a.value : ""}
                        onChange={(e) => e.target.value && save(q, { value: e.target.value })}
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">Choose…</option>
                        {opts.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : q.answer_type === "multi_select" ? (
                      <div className="flex flex-col gap-1">
                        {opts.map((o) => {
                          const cur = Array.isArray(a?.value) ? (a!.value as string[]) : [];
                          return (
                            <label key={o.value} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                disabled={disabled}
                                checked={cur.includes(o.value)}
                                onChange={(e) => save(q, { value: e.target.checked ? [...cur, o.value] : cur.filter((x) => x !== o.value) })}
                              />
                              {o.label}
                            </label>
                          );
                        })}
                      </div>
                    ) : q.answer_type === "boolean" ? (
                      <div className="flex gap-2">
                        {[true, false].map((b) => (
                          <Button key={String(b)} type="button" size="sm" disabled={disabled} variant={a?.value === b ? "default" : "outline"} onClick={() => save(q, { value: b })}>
                            {b ? "Yes" : "No"}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const v = q.answer_type === "number" ? Number(draft) : draft;
                          void save(q, { value: v });
                        }}
                      >
                        {q.answer_type === "long_text" ? (
                          <Textarea rows={2} disabled={disabled} value={draft} onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))} />
                        ) : (
                          <Input
                            type={q.answer_type === "number" ? "number" : q.answer_type === "date" ? "date" : "text"}
                            disabled={disabled}
                            value={draft}
                            onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                          />
                        )}
                        <Button type="submit" size="sm" variant="secondary" disabled={disabled || !draft}>
                          Save
                        </Button>
                      </form>
                    )}
                    {canAnswer && !q.required && !a && (
                      <button
                        type="button"
                        className="mt-1 text-[11px] text-muted-foreground hover:underline"
                        onClick={() => {
                          const r = window.prompt("Why is this question being skipped?");
                          if (r?.trim()) void save(q, { skip_reason: r.trim() });
                        }}
                      >
                        Skip with reason
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
