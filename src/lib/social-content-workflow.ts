import type { SocialContentType, SocialContentStage } from "@/generated/prisma/enums";

/**
 * One shared SocialContentStage enum backs all four content workflows, but
 * each type's valid ordered sequence differs (only a real-person reel passes
 * through CLIENT_CLIPS_RECEIVED, per the process doc). Kept here in code
 * rather than as four near-duplicate enums — matches how this app already
 * keeps a flat status enum on the record and puts the transition rules in a
 * lib module (see src/lib/attendance.ts for the same shape of decision).
 */
const SEQUENCES: Record<SocialContentType, SocialContentStage[]> = {
  STATIC_POST: ["DRAFT", "APPROVED_TO_PROCEED", "IN_PRODUCTION", "SHARED_FOR_REVIEW", "APPROVED_FINAL", "PUBLISHED"],
  CAROUSEL: ["DRAFT", "APPROVED_TO_PROCEED", "IN_PRODUCTION", "SHARED_FOR_REVIEW", "APPROVED_FINAL", "PUBLISHED"],
  AI_REEL: ["DRAFT", "APPROVED_TO_PROCEED", "IN_PRODUCTION", "SHARED_FOR_REVIEW", "APPROVED_FINAL", "PUBLISHED"],
  REAL_PERSON_REEL: [
    "DRAFT",
    "APPROVED_TO_PROCEED",
    "CLIENT_CLIPS_RECEIVED",
    "IN_PRODUCTION",
    "SHARED_FOR_REVIEW",
    "APPROVED_FINAL",
    "PUBLISHED",
  ],
};

/** The ordered, non-cancelled stage sequence a given content type moves through. */
export function stagesFor(type: SocialContentType): SocialContentStage[] {
  return SEQUENCES[type];
}

/** Human-readable label for a stage, in this type's own sequence context. */
export function stageLabel(stage: SocialContentStage): string {
  switch (stage) {
    case "DRAFT":
      return "Draft";
    case "APPROVED_TO_PROCEED":
      return "Approved to proceed";
    case "CLIENT_CLIPS_RECEIVED":
      return "Client clips received";
    case "IN_PRODUCTION":
      return "In production";
    case "SHARED_FOR_REVIEW":
      return "Shared for review";
    case "APPROVED_FINAL":
      return "Final approval";
    case "PUBLISHED":
      return "Published";
    case "CANCELLED":
      return "Cancelled";
  }
}

/** The next stage in `type`'s sequence after `current`, or null at the end (PUBLISHED) or once CANCELLED. */
export function nextStage(type: SocialContentType, current: SocialContentStage): SocialContentStage | null {
  if (current === "CANCELLED" || current === "PUBLISHED") return null;
  const sequence = stagesFor(type);
  const index = sequence.indexOf(current);
  if (index === -1 || index === sequence.length - 1) return null;
  return sequence[index + 1];
}

/**
 * Whether moving from `from` to `to` is allowed for this content type: either
 * the single next step in sequence, or a cancellation from any non-terminal
 * stage. Skipping ahead, moving backward, or acting on a finished item are
 * all rejected.
 */
export function isValidTransition(type: SocialContentType, from: SocialContentStage, to: SocialContentStage): boolean {
  if (to === "CANCELLED") return from !== "PUBLISHED" && from !== "CANCELLED";
  return nextStage(type, from) === to;
}
