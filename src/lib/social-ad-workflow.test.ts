import { describe, expect, it } from "vitest";
import { adStages, nextAdStage, isValidAdTransition } from "./social-ad-workflow";

describe("adStages", () => {
  it("has the documented 10-stage pipeline", () => {
    expect(adStages()).toEqual([
      "DISCUSSION",
      "BUDGET_DURATION",
      "TARGETING",
      "CONTENT_APPROVAL",
      "AD_CREATION",
      "GROUP_APPROVAL",
      "CAMPAIGN_SETUP",
      "RUNNING",
      "REPORTING",
      "COMPLETED",
    ]);
  });
});

describe("nextAdStage", () => {
  it("walks the whole sequence", () => {
    expect(nextAdStage("DISCUSSION")).toBe("BUDGET_DURATION");
    expect(nextAdStage("RUNNING")).toBe("REPORTING");
    expect(nextAdStage("REPORTING")).toBe("COMPLETED");
  });

  it("returns null once completed or cancelled — both are terminal", () => {
    expect(nextAdStage("COMPLETED")).toBeNull();
    expect(nextAdStage("CANCELLED")).toBeNull();
  });
});

describe("isValidAdTransition", () => {
  it("allows the single correct next step", () => {
    expect(isValidAdTransition("DISCUSSION", "BUDGET_DURATION")).toBe(true);
  });

  it("rejects skipping ahead", () => {
    expect(isValidAdTransition("DISCUSSION", "RUNNING")).toBe(false);
  });

  it("allows moving backward (undo) to any earlier stage, including from completed", () => {
    expect(isValidAdTransition("RUNNING", "TARGETING")).toBe(true);
    expect(isValidAdTransition("COMPLETED", "DISCUSSION")).toBe(true);
  });

  it("allows cancelling from any non-terminal stage, rejects from completed or cancelled", () => {
    expect(isValidAdTransition("DISCUSSION", "CANCELLED")).toBe(true);
    expect(isValidAdTransition("RUNNING", "CANCELLED")).toBe(true);
    expect(isValidAdTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(isValidAdTransition("CANCELLED", "CANCELLED")).toBe(false);
  });

  it("allows restoring a cancelled campaign back into the sequence at any stage", () => {
    expect(isValidAdTransition("CANCELLED", "DISCUSSION")).toBe(true);
    expect(isValidAdTransition("CANCELLED", "COMPLETED")).toBe(true);
  });

  it("rejects a no-op to the same stage", () => {
    expect(isValidAdTransition("RUNNING", "RUNNING")).toBe(false);
  });
});
