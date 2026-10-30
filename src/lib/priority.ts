/** Badge color for each Priority value (see the Prisma `Priority` enum) — shared by every module that shows one (Leads, Tasks, the dashboard). */
export const PRIORITY_VARIANT = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  URGENT: "destructive",
} as const;
