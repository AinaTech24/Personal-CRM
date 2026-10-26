/**
 * A filter facet's current selection: null means "no filter" (show
 * everything); a single string is one selection; an array is a `multiple`
 * facet's selections, where an empty array also means "no filter" — matches
 * how a freshly-cleared multi-select reads.
 */
export type FilterValue = string | string[] | null;

/** Sentinel for an "Unassigned" choice in an assignee filter facet, kept distinct from a real user id — shared between a module's filter UI (client) and its list query (server), dependency-free so either side can import it safely. */
export const UNASSIGNED = "__unassigned__";

/**
 * Whether an item passes a facet's current selection. `matcher` tests one
 * selected value against the item (e.g. "is this lead assigned to `v`?");
 * with multiple values selected, matching any one of them is enough (OR
 * semantics within a facet — matches how "Status: To Do, In Progress" reads
 * as "either of these", not "both").
 */
export function facetMatches(current: FilterValue, matcher: (value: string) => boolean): boolean {
  if (current === null) return true;
  const values = Array.isArray(current) ? current : [current];
  return values.length === 0 || values.some(matcher);
}

/** Serializes a FilterValue into a single comma-joined query-param value, or undefined to omit the param entirely. */
export function filterValueToParam(v: FilterValue): string | undefined {
  if (v === null) return undefined;
  const values = Array.isArray(v) ? v : [v];
  return values.length > 0 ? values.join(",") : undefined;
}

/** The server-side counterpart to `filterValueToParam` — turns a raw query-param string back into the list of selected values, or undefined if the param is absent/empty. */
export function parseFilterParam(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}
