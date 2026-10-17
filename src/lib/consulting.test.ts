import { describe, expect, it } from "vitest";
import {
  FUNCTION_AUDIT,
  LIFECYCLE_STAGES,
  QUALIFICATION_CRITERIA,
  SYSTEMS_AUDIT,
  commercialTotal,
  currentStage,
  formatItemCode,
  isOverdue,
  lifecycleProgress,
  maturityLevelLabel,
  maturityScorecard,
  momTatDays,
  ownerDependencyRatio,
  qualification,
  riskScore,
  summarizeAssessment,
  systemizationScore,
  type QualificationScores,
  type StageStatus,
} from "./consulting";

const scores = (values: (number | null)[]) =>
  Object.fromEntries(QUALIFICATION_CRITERIA.map((c, i) => [c.key, values[i]])) as QualificationScores;

describe("catalogs match the kit", () => {
  it("has the 18-stage lifecycle numbered 0–17", () => {
    expect(LIFECYCLE_STAGES.map((s) => s.stage)).toEqual([...Array(18).keys()]);
  });

  it("has 35 function checkpoints (7×5) and 30 system checkpoints (10×3)", () => {
    expect(FUNCTION_AUDIT).toHaveLength(7);
    expect(FUNCTION_AUDIT.flatMap((g) => g.checkpoints)).toHaveLength(35);
    expect(SYSTEMS_AUDIT).toHaveLength(10);
    expect(SYSTEMS_AUDIT.flatMap((g) => g.checkpoints)).toHaveLength(30);
  });

  it("uses unique checkpoint keys", () => {
    const keys = [...FUNCTION_AUDIT, ...SYSTEMS_AUDIT].flatMap((g) => g.checkpoints.map((c) => c.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("qualification", () => {
  it("bands a fully scored gate per the kit's 9–12 / 6–8 / 0–5 interpretation", () => {
    expect(qualification(scores([2, 2, 2, 1, 1, 1])).band).toBe("STRONG"); // 9
    expect(qualification(scores([2, 2, 2, 2, 2, 2])).band).toBe("STRONG"); // 12
    expect(qualification(scores([1, 1, 1, 1, 1, 1])).band).toBe("CONDITIONAL"); // 6
    expect(qualification(scores([2, 2, 2, 1, 1, 0])).band).toBe("CONDITIONAL"); // 8
    expect(qualification(scores([1, 1, 1, 1, 1, 0])).band).toBe("NURTURE"); // 5
    expect(qualification(scores([0, 0, 0, 0, 0, 0])).band).toBe("NURTURE");
  });

  it("gives no verdict until every criterion is scored", () => {
    const q = qualification(scores([2, 2, 2, 2, 2, null]));
    expect(q.band).toBeNull();
    expect(q.total).toBe(10);
    expect(q.scored).toBe(5);
  });
});

describe("lifecycle", () => {
  const stages = (statuses: StageStatus[]) => statuses.map((status, stage) => ({ stage, status }));

  it("is in the first stage that isn't done or skipped", () => {
    expect(currentStage(stages(["DONE", "SKIPPED", "IN_PROGRESS", "NOT_STARTED"]))).toBe(2);
    expect(currentStage(stages(["NOT_STARTED", "DONE"]))).toBe(0);
  });

  it("sits on the last stage once everything is closed", () => {
    expect(currentStage(stages(Array(18).fill("DONE")))).toBe(17);
  });

  it("measures progress over applicable (non-skipped) stages", () => {
    expect(lifecycleProgress(stages(["DONE", "SKIPPED", "NOT_STARTED"]))).toBe(0.5);
    expect(lifecycleProgress(stages(["SKIPPED"]))).toBe(1);
  });
});

describe("registers", () => {
  it("formats human IDs with the kind's prefix", () => {
    expect(formatItemCode("ACTION", 7)).toBe("A-007");
    expect(formatItemCode("CHANGE_REQUEST", 12)).toBe("CR-012");
  });

  it("treats an open item past its due date as overdue, but not on the due date itself", () => {
    expect(isOverdue({ kind: "ACTION", status: "OPEN", dueDate: "2026-10-01" }, "2026-10-02")).toBe(true);
    expect(isOverdue({ kind: "ACTION", status: "OPEN", dueDate: "2026-10-02" }, "2026-10-02")).toBe(false);
    expect(isOverdue({ kind: "ACTION", status: "DONE", dueDate: "2026-10-01" }, "2026-10-02")).toBe(false);
    expect(isOverdue({ kind: "ACTION", status: "OPEN", dueDate: null }, "2026-10-02")).toBe(false);
  });

  it("scores risk as probability × impact once both are set", () => {
    expect(riskScore({ probability: "4", impact: "5" })).toBe(20);
    expect(riskScore({ probability: 3 })).toBeNull();
  });

  it("totals billing items with tax", () => {
    expect(commercialTotal({ amount: 100000, taxPercent: 18 })).toBe(118000);
    expect(commercialTotal({ amount: 50000 })).toBe(50000);
    expect(commercialTotal({})).toBeNull();
  });

  it("measures MOM turnaround in days", () => {
    expect(momTatDays({ actualDate: "2026-10-01", momSentDate: "2026-10-03" })).toBe(2);
    expect(momTatDays({ actualDate: "2026-10-01" })).toBeNull();
  });
});

describe("diagnostic", () => {
  it("averages each maturity area from its checkpoints, ignoring unscored ones", () => {
    const rows = maturityScorecard({
      checkpoints: { "F-MKT-1": { score: 2 }, "F-MKT-2": { score: 4 }, "F-MKT-3": { score: null }, "S-IT-1": { score: 5 } },
    });
    const marketing = rows.find((r) => r.key === "marketing")!;
    expect(marketing.current).toBe(3);
    expect(marketing.target).toBe(4);
    expect(marketing.gap).toBe(1);
    expect(rows.find((r) => r.key === "technology")!.current).toBe(5);
    expect(rows.find((r) => r.key === "sales")!.current).toBeNull();
  });

  it("honours per-area targets", () => {
    const rows = maturityScorecard({ checkpoints: { "F-SAL-1": { score: 3 } }, targets: { sales: 5 } });
    expect(rows.find((r) => r.key === "sales")!.gap).toBe(2);
  });

  it("labels maturity levels, rounding to the nearest level", () => {
    expect(maturityLevelLabel(3.2)).toBe("Level 3 — Process Driven");
    expect(maturityLevelLabel(null)).toBe("Not scored");
  });

  it("computes owner dependency and systemization as the workbook does", () => {
    expect(ownerDependencyRatio({ total: 10, dependent: 5 })).toBe(0.5);
    expect(ownerDependencyRatio({ total: 0, dependent: 0 })).toBeNull();
    expect(systemizationScore({ defined: true, documented: true, assigned: true })).toBe(0.6);
    expect(systemizationScore(undefined)).toBe(0);
  });

  it("summarizes critical findings as low scores or HIGH-priority checkpoints", () => {
    const s = summarizeAssessment({
      checkpoints: { "F-MKT-1": { score: 1 }, "F-MKT-2": { score: 4, priority: "HIGH" }, "F-MKT-3": { score: 4 } },
      ownerDependency: { sales: { total: 10, dependent: 8 } },
    });
    expect(s.criticalFindings).toBe(2);
    expect(s.scoredCheckpoints).toBe(3);
    expect(s.totalCheckpoints).toBe(65);
    expect(s.avgOwnerDependency).toBe(0.8);
  });
});
