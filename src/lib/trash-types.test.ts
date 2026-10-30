import { describe, expect, it } from "vitest";
import { TRASH_RETENTION_DAYS, trashExpiresAt } from "./trash-types";

describe("trashExpiresAt", () => {
  it("is 30 days after the deletion time", () => {
    const deletedAt = new Date("2026-01-01T00:00:00Z");
    expect(TRASH_RETENTION_DAYS).toBe(30);
    expect(trashExpiresAt(deletedAt).toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
});
