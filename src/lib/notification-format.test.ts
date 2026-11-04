import { describe, expect, it } from "vitest";
import { NOTIFICATION_CATEGORIES, TYPE_TO_CATEGORY } from "./notification-categories";
import { NOTIFICATION_ICON } from "./notification-format";

describe("notification type registries", () => {
  it("gives every categorized type an icon, and vice versa", () => {
    // These two registries are hand-maintained in separate files (one needs
    // an icon component, which has no business in the pure category-data
    // module) with nothing tying them together at compile time — this is
    // the check that catches a type added to one and forgotten in the
    // other, same gap that originally left form_created/form_edited/
    // expense_* notifications un-mutable via Settings.
    const categorized = Object.keys(TYPE_TO_CATEGORY).sort();
    const iconed = Object.keys(NOTIFICATION_ICON).sort();
    expect(iconed).toEqual(categorized);
  });

  it("only maps types to categories that Settings actually lists", () => {
    const knownCategories = new Set(NOTIFICATION_CATEGORIES.map((c) => c.value));
    for (const [type, category] of Object.entries(TYPE_TO_CATEGORY)) {
      expect(knownCategories.has(category), `"${type}" maps to unlisted category "${category}"`).toBe(true);
    }
  });
});
