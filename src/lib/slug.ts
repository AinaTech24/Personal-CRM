/**
 * URL-safe key derived from a display name.
 *
 * Shared so creating and renaming a department derive the slug identically —
 * two copies of this rule would eventually disagree and let a rename collide
 * with a name that create had allowed.
 */
export function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
