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
};
