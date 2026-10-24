import type { ManagedModule } from "@/generated/prisma/enums";

export type { ManagedModule };

/**
 * Pure constants, deliberately apart from module-permissions-store.ts — that
 * file imports db.ts, which eagerly builds a Prisma client, so anything
 * importing it can't be used from a "use client" component (same split as
 * src/lib/social-media-permissions.ts vs social-media.ts).
 */
export const MANAGED_MODULES: ManagedModule[] = [
  "LEAVE",
  "ATTENDANCE",
  "TASKS",
  "MEETINGS",
  "LEADS",
  "CLIENTS",
  "BIRTHDAYS",
  "MESSAGES",
  "PROJECTS",
  "EXPENSES",
];

export const MODULE_LABEL: Record<ManagedModule, string> = {
  LEAVE: "Leave",
  ATTENDANCE: "Attendance",
  TASKS: "Tasks",
  MEETINGS: "Meetings",
  LEADS: "Leads",
  CLIENTS: "Clients",
  BIRTHDAYS: "Birthdays",
  MESSAGES: "Messages",
  PROJECTS: "Projects",
  EXPENSES: "Expenses",
};

/** The four independent actions a module grant can carry. */
export type ModuleAction = "CREATE" | "READ" | "UPDATE" | "DELETE";

export const MODULE_ACTIONS: ModuleAction[] = ["CREATE", "READ", "UPDATE", "DELETE"];

export const MODULE_ACTION_LABEL: Record<ModuleAction, string> = {
  CREATE: "Create",
  READ: "Read",
  UPDATE: "Update",
  DELETE: "Delete",
};

/**
 * One module's four action flags plus `blocked` — the shape stored per
 * (user, module) and shown as one row of the Permission Manager's matrix.
 * `blocked` is deliberately independent of the four CRUD flags: it hides the
 * module's nav link for this person outright, overriding even their usual
 * baseline own-record access, where the CRUD flags only ever widen beyond
 * that baseline.
 */
export interface ModulePermissionFlags {
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  blocked: boolean;
}

export const NO_MODULE_ACCESS: ModulePermissionFlags = {
  canCreate: false,
  canRead: false,
  canUpdate: false,
  canDelete: false,
  blocked: false,
};

export const FULL_MODULE_ACCESS: ModulePermissionFlags = {
  canCreate: true,
  canRead: true,
  canUpdate: true,
  canDelete: true,
  blocked: false,
};

export function hasModuleAction(flags: ModulePermissionFlags, action: ModuleAction): boolean {
  switch (action) {
    case "CREATE":
      return flags.canCreate;
    case "READ":
      return flags.canRead;
    case "UPDATE":
      return flags.canUpdate;
    case "DELETE":
      return flags.canDelete;
  }
}
