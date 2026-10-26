export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;

/**
 * Packs a list of tags into the single pipe-delimited column Note.tags
 * stores — deduped, trimmed, capped, and wrapped in a leading/trailing pipe
 * ("|work|urgent|") so a `contains` filter for one tag can't accidentally
 * match inside a different, longer tag. An empty list serializes to null
 * rather than an empty string, matching every other optional column here.
 */
export function serializeTags(tags: string[]): string | null {
  const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).slice(0, MAX_TAGS);
  return cleaned.length ? `|${cleaned.join("|")}|` : null;
}

/** The inverse of serializeTags — always returns a plain array, even for null/empty input. */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const inner = raw.startsWith("|") && raw.endsWith("|") ? raw.slice(1, -1) : raw;
  return inner.split("|").filter(Boolean);
}

/** The exact substring a Prisma `contains` filter needs to match one whole tag — see serializeTags' delimiters. */
export function tagContainsFragment(tag: string): string {
  return `|${tag.trim()}|`;
}
