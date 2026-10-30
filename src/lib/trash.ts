import type { PermissionUser } from "@/lib/permissions";
import { listTrashedLeadsFor, restoreLead, purgeLead } from "@/lib/leads";
import { listTrashedTasksFor, restoreTask, purgeTask } from "@/lib/tasks";
import { listTrashedMeetingsFor, restoreMeeting, purgeMeeting } from "@/lib/meetings";
import { listTrashedProjectsFor, restoreProject, purgeProject } from "@/lib/projects";
import { TRASH_MODULE_KEYS, TRASH_MODULE_LABEL, type TrashActionResult, type TrashItem, type TrashModuleKey } from "@/lib/trash-types";

export { TRASH_MODULE_KEYS, TRASH_MODULE_LABEL, type TrashItem, type TrashModuleKey };

interface TrashProvider {
  list: (user: PermissionUser) => Promise<TrashItem[]>;
  restore: (user: PermissionUser, id: string) => Promise<TrashActionResult>;
  purge: (user: PermissionUser, id: string) => Promise<TrashActionResult>;
}

/**
 * One entry per module that's gotten its own Trash support — add to this (and
 * to TRASH_MODULE_KEYS in trash-types.ts) as each module is built out, same
 * pattern as leads: a soft-delete column, a list-where that excludes/includes
 * it, and a {list, restore, purge} trio in that module's own lib file.
 */
const TRASH_PROVIDERS: Record<TrashModuleKey, TrashProvider> = {
  leads: { list: listTrashedLeadsFor, restore: restoreLead, purge: purgeLead },
  tasks: { list: listTrashedTasksFor, restore: restoreTask, purge: purgeTask },
  meetings: { list: listTrashedMeetingsFor, restore: restoreMeeting, purge: purgeMeeting },
  projects: { list: listTrashedProjectsFor, restore: restoreProject, purge: purgeProject },
};

export function trashProviderFor(module: string): TrashProvider | null {
  return isTrashModuleKey(module) ? TRASH_PROVIDERS[module] : null;
}

export function isTrashModuleKey(module: string): module is TrashModuleKey {
  return (TRASH_MODULE_KEYS as readonly string[]).includes(module);
}

/** Everything in Trash this user can see, across every registered module, newest first. */
export async function listAllTrashFor(user: PermissionUser): Promise<TrashItem[]> {
  const lists = await Promise.all(TRASH_MODULE_KEYS.map((m) => TRASH_PROVIDERS[m].list(user)));
  return lists.flat().sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
}
