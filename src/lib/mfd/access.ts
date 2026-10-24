/**
 * Who the caller is in the Command Centre, and what the spec lets them do.
 *
 * Roles come from cc_role_assignments (spec `user_role`). A company Super
 * Admin is implicitly `platform_admin` and a company Admin `aina_admin`, so
 * the existing admins can bootstrap the module without a separate grant.
 *
 * The spec's permission matrix is an *upper bound* (GV-08): the action must
 * be in the role's CRUAPE codes AND the record must be in scope — either the
 * role is workspace-wide (admins, director, auditor) or the record's MFD is
 * covered by an active client access grant (plus own leads/opportunities for
 * sales-style ownership).
 */
import { PERMISSIONS } from "./catalog";
import type { Classification, FieldDef } from "./catalog-types";
import { tableConfig } from "./module-config";

export const USER_ROLES = [
  "platform_admin",
  "aina_admin",
  "director",
  "consulting_head",
  "senior_consultant",
  "consultant",
  "analyst",
  "sales",
  "finance_ops",
  "client_owner",
  "client_manager",
  "auditor",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type Action = "C" | "R" | "U" | "A" | "P" | "E";

/** Roles whose record scope is the whole workspace (spec "Record Scope"). */
const WORKSPACE_ROLES = new Set<UserRole>(["platform_admin", "aina_admin", "director", "auditor"]);
const ADMIN_ROLES = new Set<UserRole>(["platform_admin", "aina_admin"]);
const CLIENT_ROLES = new Set<UserRole>(["client_owner", "client_manager"]);

export interface Actor {
  userId: string;
  name: string;
  workspaceId: string;
  roles: Set<UserRole>;
  /** This user's team_members row, if they have one. */
  memberId: string | null;
  /** MFD orgs covered by an active, unexpired client access grant. */
  grantedOrgIds: Set<string>;
}

export function isAdminActor(a: Actor) {
  return [...a.roles].some((r) => ADMIN_ROLES.has(r));
}

export function hasAnyRole(a: Actor) {
  return a.roles.size > 0;
}

/** CRUAPE codes this actor holds on a table, unioned across roles. */
export function codesFor(a: Actor, table: string): string {
  const permTable = permissionTableOf(table);
  const out = new Set<string>();
  for (const role of a.roles) {
    let codes = "";
    if (permTable === "admin") codes = ADMIN_ROLES.has(role) ? "CRUAPE" : "";
    else if (permTable === "audit") codes = ADMIN_ROLES.has(role) ? "RE" : role === "director" || role === "auditor" ? "R" : "";
    else codes = PERMISSIONS[permTable]?.[role] ?? "";
    for (const c of codes) out.add(c);
  }
  return [...out].join("");
}

export function can(a: Actor, table: string, action: Action) {
  return codesFor(a, table).includes(action);
}

export function permissionTableOf(table: string) {
  return tableConfig(table).permissionTable ?? table;
}

/** Workspace-wide visibility on this table: a workspace-scoped role that can also read it. */
export function isWorkspaceWide(a: Actor, table: string) {
  const permTable = permissionTableOf(table);
  return [...a.roles].some((r) => {
    if (!WORKSPACE_ROLES.has(r)) return false;
    if (permTable === "admin") return ADMIN_ROLES.has(r);
    if (permTable === "audit") return true;
    return (PERMISSIONS[permTable]?.[r] ?? "").includes("R");
  });
}

const EMPTY = "__none__";

/**
 * Prisma `where` limiting a list to rows this actor may see. Support tables
 * without their own mfd_org_id are scoped through their parent instead (the
 * engine requires the parent filter and checks the parent's access).
 */
export function scopeWhere(a: Actor, table: string, columns: Set<string>): Record<string, unknown> {
  const base: Record<string, unknown> = columns.has("workspace_id") ? { workspaceId: a.workspaceId } : {};
  if (isWorkspaceWide(a, table)) return base;

  const granted = [...a.grantedOrgIds];
  const inGranted = { in: granted.length ? granted : [EMPTY] };
  const or: Record<string, unknown>[] = [];

  switch (table) {
    case "mfd_organizations":
      or.push({ id: inGranted });
      if (a.memberId) or.push({ accountOwnerId: a.memberId });
      break;
    case "leads":
      or.push({ createdByUserId: a.userId }, { mfdOrgId: inGranted });
      if (a.memberId) or.push({ assignedMemberId: a.memberId });
      break;
    case "sales_opportunities":
      or.push({ createdByUserId: a.userId }, { mfdOrgId: inGranted });
      if (a.memberId) or.push({ ownerMemberId: a.memberId });
      break;
    case "assessment_templates":
      or.push({ mfdOrgId: null }, { mfdOrgId: inGranted });
      break;
    case "file_objects":
      or.push({ mfdOrgId: inGranted }, { uploadedByUserId: a.userId });
      break;
    case "team_members":
    case "kpi_definitions":
    case "scoring_schemes":
      // Workspace reference data: visible to anyone allowed to read the module.
      return base;
    default:
      if (columns.has("mfd_org_id")) or.push({ mfdOrgId: inGranted });
      else return base; // parent-scoped; enforced by the engine
  }
  return { ...base, OR: or };
}

/** Row-level check mirroring scopeWhere, for single-record reads/writes. */
export function rowInScope(a: Actor, table: string, row: Record<string, unknown>): boolean {
  if (row.workspace_id !== undefined && row.workspace_id !== a.workspaceId) return false;
  if (isWorkspaceWide(a, table)) return true;
  const org = (row.mfd_org_id as string | null | undefined) ?? null;
  const granted = (id: string | null) => !!id && a.grantedOrgIds.has(id);
  switch (table) {
    case "mfd_organizations":
      return granted(row.id as string) || (!!a.memberId && row.account_owner_id === a.memberId);
    case "leads":
      return row.created_by_user_id === a.userId || granted(org) || (!!a.memberId && row.assigned_member_id === a.memberId);
    case "sales_opportunities":
      return row.created_by_user_id === a.userId || granted(org) || (!!a.memberId && row.owner_member_id === a.memberId);
    case "assessment_templates":
      return org === null || granted(org);
    case "file_objects":
      return granted(org) || row.uploaded_by_user_id === a.userId;
    case "team_members":
    case "kpi_definitions":
    case "scoring_schemes":
      return true;
    default:
      return "mfd_org_id" in row ? granted(org) : true;
  }
}

/** May the actor attach records to / create records under this MFD? */
export function canUseOrg(a: Actor, orgId: string | null) {
  if (!orgId) return true;
  return isAdminActor(a) || [...a.roles].some((r) => WORKSPACE_ROLES.has(r) && r !== "auditor") || a.grantedOrgIds.has(orgId);
}

/**
 * Field visibility by classification (spec "Field security"):
 *  - Restricted: admins, consulting_head, director, and finance_ops on billing.
 *  - Sensitive: hidden from analyst, auditor and client portal roles.
 *  - Confidential: hidden from client portal roles, except released minutes.
 */
export function canSeeField(a: Actor, table: string, f: Pick<FieldDef, "classification" | "column">): boolean {
  const roles = [...a.roles];
  const only = (set: Set<UserRole>) => roles.length > 0 && roles.every((r) => set.has(r));
  const c = f.classification as Classification;
  if (c === "Restricted") {
    return roles.some(
      (r) => ADMIN_ROLES.has(r) || r === "consulting_head" || r === "director" || (r === "finance_ops" && table === "billing_records")
    );
  }
  if (c === "Sensitive") return !only(new Set<UserRole>(["analyst", "auditor", "client_owner", "client_manager"]));
  if (c === "Confidential") {
    if (only(CLIENT_ROLES)) return f.column === "client_approved_minutes";
    return true;
  }
  return true;
}
