/**
 * Shared, dependency-free pieces of the Trash module — kept apart from
 * trash.ts (the per-module registry) specifically so a module's own lib
 * file (leads.ts, and later tasks.ts, etc.) can import these without a
 * leads.ts <-> trash.ts import cycle: trash.ts imports each module's
 * list/restore/purge functions, so those functions' own file can't import
 * trash.ts back.
 */

/** How long a trashed record stays recoverable before the purge job deletes it for good. */
export const TRASH_RETENTION_DAYS = 30;

export function trashExpiresAt(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/** Registered as each module gets its own Trash support — see trash.ts's TRASH_MODULE_KEYS. */
export const TRASH_MODULE_KEYS = ["leads", "tasks", "meetings", "projects"] as const;
export type TrashModuleKey = (typeof TRASH_MODULE_KEYS)[number];

export const TRASH_MODULE_LABEL: Record<TrashModuleKey, string> = {
  leads: "Leads",
  tasks: "Tasks",
  meetings: "Meetings",
  projects: "Projects",
};

/** One row in the Trash page — the same shape regardless of which module it came from. */
export interface TrashItem {
  id: string;
  module: TrashModuleKey;
  moduleLabel: string;
  title: string;
  subtitle: string | null;
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  expiresAt: string;
}

export type TrashActionResult = "ok" | "forbidden" | "not_found";
