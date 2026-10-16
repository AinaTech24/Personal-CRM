import { describe, expect, it } from "vitest";
import { isTeamLead, canManageTeam, type TeamMembership } from "./team-permissions";
import type { PermissionUser } from "./permissions";

function user(overrides: Partial<PermissionUser> = {}): PermissionUser {
  return { id: "u1", role: "DEPARTMENT_USER", departmentId: null, ...overrides };
}

describe("isTeamLead", () => {
  it("company admins count as lead even without a membership row", () => {
    expect(isTeamLead(user({ role: "ADMIN" }), null)).toBe(true);
    expect(isTeamLead(user({ role: "SUPER_ADMIN" }), null)).toBe(true);
  });

  it("a member is only a lead if their row says so", () => {
    expect(isTeamLead(user(), { isLead: false })).toBe(false);
    expect(isTeamLead(user(), { isLead: true })).toBe(true);
  });

  it("no membership row and not an admin is never a lead", () => {
    expect(isTeamLead(user(), null)).toBe(false);
  });
});

describe("canManageTeam", () => {
  const lead: TeamMembership = { isLead: true };
  const member: TeamMembership = { isLead: false };

  it("a company admin can manage any team, with or without a membership row", () => {
    expect(canManageTeam(user({ role: "ADMIN" }), null)).toBe(true);
  });

  it("a team's own lead can manage it", () => {
    expect(canManageTeam(user(), lead)).toBe(true);
  });

  it("a regular (non-lead) member cannot", () => {
    expect(canManageTeam(user(), member)).toBe(false);
  });

  it("someone with no membership at all cannot", () => {
    expect(canManageTeam(user(), null)).toBe(false);
  });
});
