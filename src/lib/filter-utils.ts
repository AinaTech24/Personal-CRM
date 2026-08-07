/**
 * A filter facet's current selection: null means "no filter" (show
 * everything); a single string is one selection; an array is a `multiple`
 * facet's selections, where an empty array also means "no filter" — matches
 * how a freshly-cleared multi-select reads.
 */
export type FilterValue = string | string[] | null;

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
