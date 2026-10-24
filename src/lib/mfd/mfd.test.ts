import { describe, expect, it, beforeAll, vi } from "vitest";

// Pure logic only — nothing here touches the database.
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/notify", () => ({ notifyAndPush: vi.fn() }));
import { MODULES, PICKLISTS, TABLES, fieldDef } from "./catalog";
import { CHILD_TABLES, TABLE_CONFIG } from "./module-config";
import { RULES, LINK_TABLE } from "./rules";
import { canSeeField, codesFor, rowInScope, scopeWhere, type Actor, type UserRole } from "./access";
import { completion, computeScorecard, isVisible, validateResponse, type AnswerLike, type QuestionLike } from "./scoring";
import { FieldError, normalizeInput } from "./values";
import { downloadToken, scanBytes, verifyDownloadToken } from "./storage";
import { AINA_DIAGNOSTIC, MATURITY_LEVELS } from "./starter";
import { checkRespondentToken, respondentExpiry, respondentToken } from "./respondent";

const actor = (roles: UserRole[], granted: string[] = [], memberId: string | null = null): Actor => ({
  userId: "u1",
  name: "Test",
  workspaceId: "ws",
  roles: new Set(roles),
  memberId,
  grantedOrgIds: new Set(granted),
});

describe("catalog ↔ config consistency", () => {
  it("covers all 26 modules and every table has a config", () => {
    expect(MODULES).toHaveLength(26);
    for (const t of Object.keys(TABLES)) expect(TABLE_CONFIG[t], t).toBeDefined();
    for (const t of Object.keys(TABLE_CONFIG)) expect(TABLES[t], t).toBeDefined();
  });

  it("only references columns that exist", () => {
    for (const [t, c] of Object.entries(TABLE_CONFIG)) {
      const cols = [...c.listColumns, ...c.searchFields, c.labelField, ...(c.serverFields ?? [])];
      if (c.statusField) cols.push(c.statusField);
      if (c.numbering) cols.push(c.numbering.field);
      if (c.defaultSort) cols.push(c.defaultSort.field);
      for (const col of cols) expect(fieldDef(t, col), `${t}.${col}`).not.toBeNull();
      if (c.parent) {
        expect(TABLES[c.parent.table], `${t} parent`).toBeDefined();
        expect(fieldDef(t, c.parent.field), `${t}.${c.parent.field}`).not.toBeNull();
      }
      const status = c.statusField ? fieldDef(t, c.statusField) : null;
      for (const s of [...(c.approvalStatuses ?? []), ...(c.actionOnlyStatuses ?? [])]) {
        expect(PICKLISTS[status!.picklist!].map((o) => o.value), `${t} status ${s}`).toContain(s);
      }
    }
  });

  it("wires rules, child panels and document links to real tables", () => {
    for (const t of Object.keys(RULES)) expect(TABLES[t], t).toBeDefined();
    for (const [t, kids] of Object.entries(CHILD_TABLES)) {
      for (const k of kids) expect(fieldDef(k.table, k.field), `${t} → ${k.table}.${k.field}`).not.toBeNull();
    }
    for (const target of Object.values(LINK_TABLE)) expect(TABLES[target], target).toBeDefined();
  });

  it("maps the kit diagnostic onto real dimensions", () => {
    const dims = PICKLISTS.assessment_dimension.map((o) => o.value);
    for (const g of AINA_DIAGNOSTIC) expect(dims).toContain(g.dimension);
    expect(AINA_DIAGNOSTIC.reduce((n, g) => n + g.items.length, 0)).toBe(65);
    expect(MATURITY_LEVELS.map((l) => l.score)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("field normalization", () => {
  const f = (t: string, c: string) => fieldDef(t, c)!;
  it("rejects values outside a picklist", () => {
    expect(() => normalizeInput("leads", f("leads", "status"), "bogus")).toThrow(FieldError);
    expect(normalizeInput("leads", f("leads", "status"), "qualified")).toBe("qualified");
  });
  it("validates email and E.164 phone", () => {
    expect(() => normalizeInput("leads", f("leads", "email"), "not-an-email")).toThrow(FieldError);
    expect(() => normalizeInput("leads", f("leads", "mobile_e164"), "98765 43210")).toThrow(FieldError);
    expect(normalizeInput("leads", f("leads", "mobile_e164"), "+919876543210")).toBe("+919876543210");
  });
  it("canonicalizes decimals without floating point", () => {
    expect(normalizeInput("billing_records", f("billing_records", "amount_subtotal"), "100000")).toBe("100000.00");
    // A float artefact is refused, not silently rounded.
    expect(() => normalizeInput("billing_records", f("billing_records", "amount_subtotal"), 0.1 + 0.2)).toThrow(FieldError);
    expect(normalizeInput("billing_records", f("billing_records", "amount_subtotal"), "1234.5")).toBe("1234.50");
  });
  it("rejects impossible dates", () => {
    expect(() => normalizeInput("business_profiles", f("business_profiles", "as_of_date"), "2026-02-30")).toThrow(FieldError);
  });
});

describe("access (GV-08, AT-01, AT-02)", () => {
  it("unions CRUAPE codes across roles and gives admins the admin tables", () => {
    expect(codesFor(actor(["platform_admin"]), "role_assignments")).toContain("C");
    expect(codesFor(actor(["consultant"]), "role_assignments")).toBe("");
    expect(codesFor(actor(["finance_ops"]), "media_records")).toBe("");
  });
  it("limits a consultant to granted MFDs", () => {
    const a = actor(["consultant"], ["org-a"]);
    expect(rowInScope(a, "findings", { workspace_id: "ws", mfd_org_id: "org-a" })).toBe(true);
    expect(rowInScope(a, "findings", { workspace_id: "ws", mfd_org_id: "org-b" })).toBe(false);
    expect(rowInScope(a, "findings", { workspace_id: "other", mfd_org_id: "org-a" })).toBe(false);
    const where = scopeWhere(a, "findings", new Set(["workspace_id", "mfd_org_id"]));
    expect(where).toEqual({ workspaceId: "ws", OR: [{ mfdOrgId: { in: ["org-a"] } }] });
  });
  it("lets workspace-wide roles see every MFD", () => {
    expect(rowInScope(actor(["director"]), "findings", { workspace_id: "ws", mfd_org_id: "org-z" })).toBe(true);
  });
  it("hides classified fields by role", () => {
    const restricted = { classification: "Restricted" as const, column: "x" };
    const confidential = { classification: "Confidential" as const, column: "review_notes" };
    expect(canSeeField(actor(["consultant"]), "t", restricted)).toBe(false);
    expect(canSeeField(actor(["consulting_head"]), "t", restricted)).toBe(true);
    expect(canSeeField(actor(["client_owner"]), "t", confidential)).toBe(false);
    expect(canSeeField(actor(["client_owner"]), "t", { classification: "Confidential", column: "client_approved_minutes" })).toBe(true);
  });
});

const q = (id: string, dimension: string, extra: Partial<QuestionLike> = {}): QuestionLike => ({
  id,
  question_key: id,
  dimension,
  answer_type: "single_select",
  required: true,
  options_json: MATURITY_LEVELS,
  visibility_rule_json: null,
  weight: "1",
  status: "active",
  ...extra,
});
const ans = (id: string, question_id: string, value: unknown, extra: Partial<AnswerLike> = {}): AnswerLike => ({
  id,
  question_id,
  response_json: value === undefined ? null : { value },
  response_state: "submitted",
  supersedes_answer_id: null,
  skip_reason: null,
  ...extra,
});

describe("assessments & scoring (AT-11, AT-12)", () => {
  const scheme = { rubric_json: { scale: { min: 1, max: 5 } }, weights_json: { sales: 1, hr: 1 } };
  const questions = [q("s1", "sales"), q("s2", "sales"), q("h1", "hr"), q("h2", "hr", { required: false })];

  it("validates responses by answer type", () => {
    expect(validateResponse(questions[0], "3")).toBeNull();
    expect(validateResponse(questions[0], "9")).not.toBeNull();
    expect(validateResponse({ ...questions[0], answer_type: "boolean" }, "yes")).not.toBeNull();
  });

  it("uses only the latest, non-void answer per question", () => {
    const answers = [ans("a1", "s1", "1"), ans("a2", "s1", "4", { supersedes_answer_id: "a1", response_state: "corrected" }), ans("a3", "s2", "2")];
    const r = computeScorecard(questions, answers, scheme, new Set(), "maturity");
    const sales = r.dimensions.find((d) => d.dimension === "sales")!;
    expect(sales.raw_score).toBe(3);
    expect(sales.answers_count).toBe(2);
  });

  it("is reproducible and weights dimensions", () => {
    const answers = [ans("a1", "s1", "2"), ans("a2", "s2", "2"), ans("a3", "h1", "5")];
    const a = computeScorecard(questions, answers, scheme, new Set(["a3"]), "maturity");
    const b = computeScorecard(questions, [...answers].reverse(), scheme, new Set(["a3"]), "maturity");
    expect(a).toEqual(b);
    expect(a.score_value).toBe(3.5);
    expect(a.maturity_level).toBe("4");
    expect(a.evidence_coverage_pct).toBeCloseTo(33.33, 2);
    expect(computeScorecard(questions, answers, scheme, new Set(), "adoption").maturity_level).toBeNull();
  });

  it("counts skips toward completion but reports missing required answers", () => {
    const c = completion(questions, [ans("a1", "s1", "3"), ans("a4", "h2", undefined, { skip_reason: "n/a" })]);
    expect(c.response_count).toBe(2);
    expect(c.completion_pct).toBe(50);
    expect(c.missingRequired).toEqual(["s2", "h1"]);
  });

  it("applies declarative visibility rules", () => {
    const cond = q("c1", "sales", { visibility_rule_json: { question_key: "s1", equals: "5" } });
    expect(isVisible(cond, new Map([["s1", "5"]]))).toBe(true);
    expect(isVisible(cond, new Map([["s1", "2"]]))).toBe(false);
  });
});

describe("file storage (AT-05)", () => {
  beforeAll(() => {
    process.env.JWT_SECRET ??= "test-secret-for-vitest";
  });
  it("quarantines executables and mismatched content", () => {
    expect(scanBytes("report.pdf", Buffer.from("%PDF-1.4 hello"))).toBeNull();
    expect(scanBytes("report.pdf", Buffer.from([0x4d, 0x5a, 0, 0]))).toMatch(/executable/);
    expect(scanBytes("photo.png", Buffer.from("%PDF"))).toMatch(/doesn't match/);
    expect(scanBytes("tool.exe", Buffer.from("x"))).toMatch(/aren't accepted/);
    expect(scanBytes("notes.txt", Buffer.from("<script>alert(1)</script>"))).toMatch(/script/);
  });
  it("issues user-bound, short-lived download tokens", () => {
    const t = downloadToken("file-1", "user-1");
    expect(verifyDownloadToken(t, "file-1", "user-1")).toBe(true);
    expect(verifyDownloadToken(t, "file-1", "user-2")).toBe(false);
    expect(verifyDownloadToken(t, "file-2", "user-1")).toBe(false);
    expect(verifyDownloadToken(`1.${t.split(".")[1]}`, "file-1", "user-1")).toBe(false);
  });
});

describe("respondent links (AUT-07)", () => {
  beforeAll(() => {
    process.env.JWT_SECRET ??= "test-secret-for-vitest";
  });
  const asm = { id: "asm-1", assigned_contact_id: "c-1", version_snapshot_hash: "h1", due_at: null, archived_at: null };
  const now = Date.parse("2026-10-24T00:00:00Z");

  it("is bound to the assessment, its respondent and the issued question set", () => {
    const { token } = respondentToken(asm, now);
    expect(checkRespondentToken(token, asm, now)).toBe(true);
    expect(checkRespondentToken(token, { ...asm, assigned_contact_id: "c-2" }, now)).toBe(false);
    expect(checkRespondentToken(token, { ...asm, version_snapshot_hash: "h2" }, now)).toBe(false);
    expect(checkRespondentToken(token, { ...asm, id: "asm-2" }, now)).toBe(false);
    expect(checkRespondentToken(token, { ...asm, archived_at: "2026-10-25T00:00:00Z" }, now)).toBe(false);
    expect(checkRespondentToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), asm, now)).toBe(false);
  });

  it("expires three days after the due date, capped at 30 days", () => {
    const { token } = respondentToken({ ...asm, due_at: "2026-10-31T00:00:00Z" }, now);
    const withDue = { ...asm, due_at: "2026-10-31T00:00:00Z" };
    expect(checkRespondentToken(token, withDue, Date.parse("2026-11-02T00:00:00Z"))).toBe(true);
    expect(checkRespondentToken(token, withDue, Date.parse("2026-11-04T00:00:00Z"))).toBe(false);
    expect(respondentExpiry({ ...asm, due_at: "2027-06-01T00:00:00Z" }, now) * 1000).toBe(now + 30 * 86_400_000);
  });

  it("needs a respondent and an issued question set", () => {
    expect(() => respondentToken({ ...asm, assigned_contact_id: null }, now)).toThrow();
    expect(() => respondentToken({ ...asm, version_snapshot_hash: null }, now)).toThrow();
  });
});
