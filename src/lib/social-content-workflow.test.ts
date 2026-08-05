import { describe, expect, it } from "vitest";
import { stagesFor, stageLabel, nextStage, isValidTransition } from "./social-content-workflow";

describe("stagesFor", () => {
  it("static post and carousel share the same 5-stage design-and-approval sequence", () => {
    const expected = ["SHARED_IN_GROUP", "APPROVED_TO_PROCEED", "IN_PRODUCTION", "APPROVED_FINAL", "PUBLISHED"];
    expect(stagesFor("STATIC_POST")).toEqual(expected);
    expect(stagesFor("CAROUSEL")).toEqual(expected);
  });

  it("AI reel starts at a script instead of a shared-in-group draft", () => {
    expect(stagesFor("AI_REEL")).toEqual(["SCRIPT", "SCRIPT_APPROVED", "IN_PRODUCTION", "SHARED_FOR_REVIEW", "APPROVED_FINAL", "PUBLISHED"]);
  });

  it("real person reel inserts CLIENT_CLIPS_RECEIVED and EDITING after script approval", () => {
    expect(stagesFor("REAL_PERSON_REEL")).toEqual([
      "SCRIPT",
      "SCRIPT_APPROVED",
      "CLIENT_CLIPS_RECEIVED",
      "EDITING",
      "IN_PRODUCTION",
      "SHARED_FOR_REVIEW",
      "APPROVED_FINAL",
      "PUBLISHED",
    ]);
  });
});

describe("stageLabel", () => {
  it("labels the shared IN_PRODUCTION stage differently per type", () => {
    expect(stageLabel("STATIC_POST", "IN_PRODUCTION")).toBe("Creative design");
    expect(stageLabel("CAROUSEL", "IN_PRODUCTION")).toBe("Carousel design");
    expect(stageLabel("AI_REEL", "IN_PRODUCTION")).toBe("Reel creation");
    expect(stageLabel("REAL_PERSON_REEL", "IN_PRODUCTION")).toBe("Reel creation");
  });

  it("labels the shared PUBLISHED stage as Published for posts, Upload for reels", () => {
    expect(stageLabel("STATIC_POST", "PUBLISHED")).toBe("Published");
    expect(stageLabel("CAROUSEL", "PUBLISHED")).toBe("Published");
    expect(stageLabel("AI_REEL", "PUBLISHED")).toBe("Upload");
    expect(stageLabel("REAL_PERSON_REEL", "PUBLISHED")).toBe("Upload");
  });
});

describe("nextStage", () => {
  it("walks a static post through its whole sequence", () => {
    expect(nextStage("STATIC_POST", "SHARED_IN_GROUP")).toBe("APPROVED_TO_PROCEED");
    expect(nextStage("STATIC_POST", "APPROVED_TO_PROCEED")).toBe("IN_PRODUCTION");
    expect(nextStage("STATIC_POST", "IN_PRODUCTION")).toBe("APPROVED_FINAL");
    expect(nextStage("STATIC_POST", "APPROVED_FINAL")).toBe("PUBLISHED");
  });

  it("returns null once published or cancelled — both are terminal", () => {
    expect(nextStage("STATIC_POST", "PUBLISHED")).toBeNull();
    expect(nextStage("STATIC_POST", "CANCELLED")).toBeNull();
  });

  it("a static post never passes through CLIENT_CLIPS_RECEIVED or SCRIPT", () => {
    // Not in its sequence at all, so index lookup returns -1 -> null rather than skipping to it.
    expect(nextStage("STATIC_POST", "CLIENT_CLIPS_RECEIVED")).toBeNull();
    expect(nextStage("STATIC_POST", "SCRIPT")).toBeNull();
  });

  it("real person reel moves from script approval into client clips, then editing, then production", () => {
    expect(nextStage("REAL_PERSON_REEL", "SCRIPT")).toBe("SCRIPT_APPROVED");
    expect(nextStage("REAL_PERSON_REEL", "SCRIPT_APPROVED")).toBe("CLIENT_CLIPS_RECEIVED");
    expect(nextStage("REAL_PERSON_REEL", "CLIENT_CLIPS_RECEIVED")).toBe("EDITING");
    expect(nextStage("REAL_PERSON_REEL", "EDITING")).toBe("IN_PRODUCTION");
  });

  it("an AI reel skips straight from script approval to production — no client clips or editing", () => {
    expect(nextStage("AI_REEL", "SCRIPT_APPROVED")).toBe("IN_PRODUCTION");
  });
});

describe("isValidTransition", () => {
  it("allows the single correct next step", () => {
    expect(isValidTransition("STATIC_POST", "SHARED_IN_GROUP", "APPROVED_TO_PROCEED")).toBe(true);
  });

  it("rejects skipping ahead", () => {
    expect(isValidTransition("STATIC_POST", "SHARED_IN_GROUP", "APPROVED_FINAL")).toBe(false);
  });

  it("allows moving backward (undo) to any earlier stage", () => {
    expect(isValidTransition("STATIC_POST", "IN_PRODUCTION", "SHARED_IN_GROUP")).toBe(true);
    expect(isValidTransition("STATIC_POST", "APPROVED_FINAL", "APPROVED_TO_PROCEED")).toBe(true);
  });

  it("rejects a stage that only belongs to a different content type's sequence", () => {
    expect(isValidTransition("STATIC_POST", "APPROVED_TO_PROCEED", "CLIENT_CLIPS_RECEIVED")).toBe(false);
    expect(isValidTransition("REAL_PERSON_REEL", "SCRIPT_APPROVED", "CLIENT_CLIPS_RECEIVED")).toBe(true);
  });

  it("allows cancelling from any non-terminal stage", () => {
    expect(isValidTransition("STATIC_POST", "SHARED_IN_GROUP", "CANCELLED")).toBe(true);
    expect(isValidTransition("STATIC_POST", "APPROVED_FINAL", "CANCELLED")).toBe(true);
  });

  it("rejects cancelling something already published or already cancelled", () => {
    expect(isValidTransition("STATIC_POST", "PUBLISHED", "CANCELLED")).toBe(false);
    expect(isValidTransition("STATIC_POST", "CANCELLED", "CANCELLED")).toBe(false);
  });

  it("still allows an undo back from published — correcting a mistake after publishing", () => {
    expect(isValidTransition("STATIC_POST", "PUBLISHED", "SHARED_IN_GROUP")).toBe(true);
    expect(isValidTransition("STATIC_POST", "PUBLISHED", "APPROVED_FINAL")).toBe(true);
  });

  it("rejects a no-op undo to the same stage", () => {
    expect(isValidTransition("STATIC_POST", "IN_PRODUCTION", "IN_PRODUCTION")).toBe(false);
  });

  it("allows restoring a cancelled item back into the sequence at any stage", () => {
    expect(isValidTransition("STATIC_POST", "CANCELLED", "SHARED_IN_GROUP")).toBe(true);
    expect(isValidTransition("STATIC_POST", "CANCELLED", "PUBLISHED")).toBe(true);
    expect(isValidTransition("STATIC_POST", "CANCELLED", "CANCELLED")).toBe(false);
  });
});
