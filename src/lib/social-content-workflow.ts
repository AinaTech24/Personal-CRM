import type { SocialContentType, SocialContentStage } from "@/generated/prisma/enums";

/**
 * One shared SocialContentStage enum backs all four content workflows, but
 * each type's own process is genuinely different — a static post/carousel
 * goes through a design-and-approval loop, while a reel starts at a script.
 * Kept here in code rather than as four near-duplicate enums — matches how
 * this app already keeps a flat status enum on the record and puts the
 * transition rules in a lib module (see src/lib/attendance.ts for the same
 * shape of decision).
 */
const SEQUENCES: Record<SocialContentType, SocialContentStage[]> = {
  STATIC_POST: ["DRAFT", "SHARED_IN_GROUP", "APPROVED_TO_PROCEED", "IN_PRODUCTION", "APPROVED_FINAL", "PUBLISHED"],
  CAROUSEL: ["DRAFT", "SHARED_IN_GROUP", "APPROVED_TO_PROCEED", "IN_PRODUCTION", "APPROVED_FINAL", "PUBLISHED"],
  AI_REEL: ["SCRIPT", "SCRIPT_APPROVED", "IN_PRODUCTION", "SHARED_FOR_REVIEW", "APPROVED_FINAL", "PUBLISHED"],
  REAL_PERSON_REEL: [
    "SCRIPT",
    "SCRIPT_APPROVED",
    "CLIENT_CLIPS_RECEIVED",
    "EDITING",
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

/**
 * Human-readable label for a stage — type-aware, since the same enum member
 * means a different thing per workflow (IN_PRODUCTION is "Creative design"
 * for a static post, "Carousel design" for a carousel, and "Reel creation"
 * for either reel type; PUBLISHED reads as "Upload" for reels).
 */
export function stageLabel(type: SocialContentType, stage: SocialContentStage): string {
  switch (stage) {
    case "DRAFT":
      // The static post/carousel workflow's own first step — the content
      // (caption/creative brief) gets written here before it's shared in the
      // group for approval. Not used by either reel workflow, which starts
      // at a script instead.
      return type === "STATIC_POST" || type === "CAROUSEL" ? "Content" : "Draft";
    case "SCRIPT":
      return "Script";
    case "SCRIPT_APPROVED":
      return "Script approval";
    case "SHARED_IN_GROUP":
      return "Shared in group";
    case "APPROVED_TO_PROCEED":
      return "Approval";
    case "CLIENT_CLIPS_RECEIVED":
      return "Video clips";
    case "EDITING":
      return "Editing";
    case "IN_PRODUCTION":
      return type === "CAROUSEL" ? "Carousel design" : type === "STATIC_POST" ? "Creative design" : "Reel creation";
    case "SHARED_FOR_REVIEW":
      return "Share in group";
    case "APPROVED_FINAL":
      return type === "STATIC_POST" || type === "CAROUSEL" ? "Creative approval" : "Final approval";
    case "PUBLISHED":
      return type === "STATIC_POST" || type === "CAROUSEL" ? "Published" : "Upload";
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
 * Whether moving from `from` to `to` is allowed for this content type: the
 * single next step in sequence, a cancellation from any non-terminal stage,
 * an "undo" back to any earlier stage in the sequence (including from
 * PUBLISHED — correcting a mistake after publishing is still allowed), or
 * restoring a cancelled item back into the sequence at any stage.
 */
export function isValidTransition(type: SocialContentType, from: SocialContentStage, to: SocialContentStage): boolean {
  if (to === "CANCELLED") return from !== "PUBLISHED" && from !== "CANCELLED";
  if (nextStage(type, from) === to) return true;

  const sequence = stagesFor(type);
  const toIndex = sequence.indexOf(to);
  if (toIndex === -1) return false;
  if (from === "CANCELLED") return true;

  const fromIndex = sequence.indexOf(from);
  if (fromIndex === -1) return false;
  return toIndex < fromIndex;
}
