import { describe, expect, it } from "vitest";
import { stagesFor, nextStage, isValidTransition } from "./social-content-workflow";

describe("stagesFor", () => {
  it("static post, carousel, and AI reel share the same 6-stage sequence", () => {
    const expected = ["DRAFT", "APPROVED_TO_PROCEED", "IN_PRODUCTION", "SHARED_FOR_REVIEW", "APPROVED_FINAL", "PUBLISHED"];
    expect(stagesFor("STATIC_POST")).toEqual(expected);
    expect(stagesFor("CAROUSEL")).toEqual(expected);
    expect(stagesFor("AI_REEL")).toEqual(expected);
  });

  it("real person reel inserts CLIENT_CLIPS_RECEIVED after approval, before production", () => {
    expect(stagesFor("REAL_PERSON_REEL")).toEqual([
      "DRAFT",
      "APPROVED_TO_PROCEED",
      "CLIENT_CLIPS_RECEIVED",
      "IN_PRODUCTION",
      "SHARED_FOR_REVIEW",
      "APPROVED_FINAL",
      "PUBLISHED",
    ]);
  });
});

describe("nextStage", () => {
  it("walks a static post through its whole sequence", () => {
    expect(nextStage("STATIC_POST", "DRAFT")).toBe("APPROVED_TO_PROCEED");
    expect(nextStage("STATIC_POST", "APPROVED_TO_PROCEED")).toBe("IN_PRODUCTION");
    expect(nextStage("STATIC_POST", "IN_PRODUCTION")).toBe("SHARED_FOR_REVIEW");
    expect(nextStage("STATIC_POST", "SHARED_FOR_REVIEW")).toBe("APPROVED_FINAL");
    expect(nextStage("STATIC_POST", "APPROVED_FINAL")).toBe("PUBLISHED");
  });

  it("returns null once published or cancelled — both are terminal", () => {
    expect(nextStage("STATIC_POST", "PUBLISHED")).toBeNull();
    expect(nextStage("STATIC_POST", "CANCELLED")).toBeNull();
  });

  it("a static post never passes through CLIENT_CLIPS_RECEIVED", () => {
    // Not in its sequence at all, so index lookup returns -1 -> null rather than skipping to it.
    expect(nextStage("STATIC_POST", "CLIENT_CLIPS_RECEIVED")).toBeNull();
  });

  it("real person reel moves from approval into client clips, not straight to production", () => {
    expect(nextStage("REAL_PERSON_REEL", "APPROVED_TO_PROCEED")).toBe("CLIENT_CLIPS_RECEIVED");
    expect(nextStage("REAL_PERSON_REEL", "CLIENT_CLIPS_RECEIVED")).toBe("IN_PRODUCTION");
  });
});

describe("isValidTransition", () => {
  it("allows the single correct next step", () => {
    expect(isValidTransition("STATIC_POST", "DRAFT", "APPROVED_TO_PROCEED")).toBe(true);
  });

  it("rejects skipping ahead", () => {
    expect(isValidTransition("STATIC_POST", "DRAFT", "SHARED_FOR_REVIEW")).toBe(false);
  });

  it("rejects moving backward", () => {
    expect(isValidTransition("STATIC_POST", "IN_PRODUCTION", "DRAFT")).toBe(false);
  });

  it("rejects a stage that only belongs to a different content type's sequence", () => {
    expect(isValidTransition("STATIC_POST", "APPROVED_TO_PROCEED", "CLIENT_CLIPS_RECEIVED")).toBe(false);
    expect(isValidTransition("REAL_PERSON_REEL", "APPROVED_TO_PROCEED", "CLIENT_CLIPS_RECEIVED")).toBe(true);
  });

  it("allows cancelling from any non-terminal stage", () => {
    expect(isValidTransition("STATIC_POST", "DRAFT", "CANCELLED")).toBe(true);
    expect(isValidTransition("STATIC_POST", "SHARED_FOR_REVIEW", "CANCELLED")).toBe(true);
  });

  it("rejects cancelling something already published or already cancelled", () => {
    expect(isValidTransition("STATIC_POST", "PUBLISHED", "CANCELLED")).toBe(false);
    expect(isValidTransition("STATIC_POST", "CANCELLED", "CANCELLED")).toBe(false);
  });

  it("rejects any move once published", () => {
    expect(isValidTransition("STATIC_POST", "PUBLISHED", "DRAFT")).toBe(false);
  });
});
