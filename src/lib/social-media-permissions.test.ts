import { describe, expect, it } from "vitest";
import {
  hasSocialMediaAccess,
  isSocialMediaLead,
  socialClientListWhere,
  canAccessSocialClient,
  type SocialMembership,
} from "./social-media-permissions";
import type { PermissionUser } from "./permissions";

function user(overrides: Partial<PermissionUser> = {}): PermissionUser {
  return { id: "u1", role: "DEPARTMENT_USER", departmentId: null, ...overrides };
}

describe("hasSocialMediaAccess", () => {
  it("company admins always have access, with or without a membership row", () => {
    expect(hasSocialMediaAccess(user({ role: "ADMIN" }), null)).toBe(true);
    expect(hasSocialMediaAccess(user({ role: "SUPER_ADMIN" }), null)).toBe(true);
  });

  it("a regular user needs a membership row", () => {
    expect(hasSocialMediaAccess(user(), null)).toBe(false);
    expect(hasSocialMediaAccess(user(), { isLead: false })).toBe(true);
  });
});

describe("isSocialMediaLead", () => {
  it("company admins count as lead even without a membership row", () => {
    expect(isSocialMediaLead(user({ role: "ADMIN" }), null)).toBe(true);
  });

  it("a member is only a lead if their row says so", () => {
    expect(isSocialMediaLead(user(), { isLead: false })).toBe(false);
    expect(isSocialMediaLead(user(), { isLead: true })).toBe(true);
  });

  it("no membership row and not an admin is never a lead", () => {
    expect(isSocialMediaLead(user(), null)).toBe(false);
  });
});

describe("socialClientListWhere", () => {
  it("imposes no filter for a lead or an admin", () => {
    expect(socialClientListWhere(user({ role: "ADMIN" }), null)).toEqual({});
    expect(socialClientListWhere(user(), { isLead: true })).toEqual({});
  });

  it("scopes a regular member to clients they created or are assigned", () => {
    const u = user({ id: "u1" });
    expect(socialClientListWhere(u, { isLead: false })).toEqual({
      OR: [{ createdById: "u1" }, { assignedToId: "u1" }],
    });
  });
});

describe("canAccessSocialClient", () => {
  const membership: SocialMembership = { isLead: false };

  it("a lead/admin can access any client", () => {
    const client = { createdById: "someone-else", assignedToId: null };
    expect(canAccessSocialClient(user({ role: "ADMIN" }), null, client)).toBe(true);
    expect(canAccessSocialClient(user(), { isLead: true }, client)).toBe(true);
  });

  it("a regular member can access a client they created", () => {
    const u = user({ id: "u1" });
    expect(canAccessSocialClient(u, membership, { createdById: "u1", assignedToId: null })).toBe(true);
  });

  it("a regular member can access a client they're assigned to", () => {
    const u = user({ id: "u1" });
    expect(canAccessSocialClient(u, membership, { createdById: "other", assignedToId: "u1" })).toBe(true);
  });

  it("a regular member cannot access a client that's neither theirs nor assigned to them", () => {
    const u = user({ id: "u1" });
    expect(canAccessSocialClient(u, membership, { createdById: "other", assignedToId: "another" })).toBe(false);
  });
});
