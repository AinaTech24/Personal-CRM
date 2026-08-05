import type { SocialAdStage } from "@/generated/prisma/enums";

/**
 * Ads have one fixed pipeline (no per-type variance like content), per the
 * process doc's ads section.
 */
const SEQUENCE: SocialAdStage[] = [
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
];

/** The ordered, non-cancelled ad stage sequence. */
export function adStages(): SocialAdStage[] {
  return SEQUENCE;
}

export function adStageLabel(stage: SocialAdStage): string {
  switch (stage) {
    case "DISCUSSION":
      return "Discussion";
    case "BUDGET_DURATION":
      return "Budget & duration";
    case "TARGETING":
      return "Targeting";
    case "CONTENT_APPROVAL":
      return "Content approval";
    case "AD_CREATION":
      return "Ad creation";
    case "GROUP_APPROVAL":
      return "Group approval";
    case "CAMPAIGN_SETUP":
      return "Campaign setup";
    case "RUNNING":
      return "Running";
    case "REPORTING":
      return "Reporting";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
  }
}

/** The next stage after `current`, or null at the end (COMPLETED) or once CANCELLED. */
export function nextAdStage(current: SocialAdStage): SocialAdStage | null {
  if (current === "CANCELLED" || current === "COMPLETED") return null;
  const index = SEQUENCE.indexOf(current);
  if (index === -1 || index === SEQUENCE.length - 1) return null;
  return SEQUENCE[index + 1];
}

/**
 * Whether moving from `from` to `to` is allowed: the single next step, a
 * cancellation from any non-terminal stage, an "undo" back to any earlier
 * stage (including from COMPLETED), or restoring a cancelled campaign back
 * into the sequence at any stage. Same rules as social-content-workflow.ts.
 */
export function isValidAdTransition(from: SocialAdStage, to: SocialAdStage): boolean {
  if (to === "CANCELLED") return from !== "COMPLETED" && from !== "CANCELLED";
  if (nextAdStage(from) === to) return true;

  const toIndex = SEQUENCE.indexOf(to);
  if (toIndex === -1) return false;
  if (from === "CANCELLED") return true;

  const fromIndex = SEQUENCE.indexOf(from);
  if (fromIndex === -1) return false;
  return toIndex < fromIndex;
}
