import type { PermissionUser } from "@/lib/permissions";
import { listTrashedLeadsFor, restoreLead, purgeLead, purgeExpiredLeads } from "@/lib/leads";
import { listTrashedTasksFor, restoreTask, purgeTask, purgeExpiredTasks } from "@/lib/tasks";
import { listTrashedMeetingsFor, restoreMeeting, purgeMeeting, purgeExpiredMeetings } from "@/lib/meetings";
import { listTrashedProjectsFor, restoreProject, purgeProject, purgeExpiredProjects } from "@/lib/projects";
import { listTrashedNotesFor, restoreNote, purgeNote, purgeExpiredNotes } from "@/lib/notes";
import { listTrashedQuotationsFor, restoreQuotation, purgeQuotation, purgeExpiredQuotations } from "@/lib/quotations";
import { listTrashedInvoicesFor, restoreInvoice, purgeInvoice, purgeExpiredInvoices } from "@/lib/invoices";
import { listTrashedCallsFor, restoreCall, purgeCall, purgeExpiredCalls } from "@/lib/calls";
import { listTrashedExpensesFor, restoreExpense, purgeExpense, purgeExpiredExpenses } from "@/lib/expenses";
import { listTrashedFormsFor, restoreForm, purgeForm, purgeExpiredForms } from "@/lib/forms";
import { listTrashedPasswordEntriesFor, restorePasswordEntry, purgePasswordEntry, purgeExpiredPasswordEntries } from "@/lib/passwords";
import { listTrashedClientsFor, restoreClient, purgeClient, purgeExpiredClients } from "@/lib/clients";
import {
  listTrashedSocialClientsFor,
  restoreSocialClient,
  purgeSocialClient,
  purgeExpiredSocialClients,
  listTrashedSocialContentFor,
  restoreSocialContent,
  purgeSocialContent,
  purgeExpiredSocialContent,
  listTrashedSocialAdsFor,
  restoreSocialAd,
  purgeSocialAd,
  purgeExpiredSocialAds,
  listTrashedSocialReportsFor,
  restoreSocialReport,
  purgeSocialReport,
  purgeExpiredSocialReports,
} from "@/lib/social-media";
import { listTrashedLeaveRequestsFor, restoreLeaveRequest, purgeLeaveRequest, purgeExpiredLeaveRequests } from "@/lib/leave-requests";
import { TRASH_MODULE_KEYS, TRASH_MODULE_LABEL, type TrashActionResult, type TrashItem, type TrashModuleKey } from "@/lib/trash-types";

export { TRASH_MODULE_KEYS, TRASH_MODULE_LABEL, type TrashItem, type TrashModuleKey };

interface TrashProvider {
  list: (user: PermissionUser) => Promise<TrashItem[]>;
  restore: (user: PermissionUser, id: string) => Promise<TrashActionResult>;
  purge: (user: PermissionUser, id: string) => Promise<TrashActionResult>;
  /** The 30-day auto-purge job's actual work for this module — see the module's own purgeExpiredX for the cutoff logic. */
  purgeExpired: () => Promise<number>;
}

/**
 * One entry per module that's gotten its own Trash support — add to this (and
 * to TRASH_MODULE_KEYS in trash-types.ts) as each module is built out, same
 * pattern as leads: a soft-delete column, a list-where that excludes/includes
 * it, and a {list, restore, purge, purgeExpired} quartet in that module's own
 * lib file. Every module's purge-trash cron route (src/app/api/.../purge-trash/route.ts)
 * dispatches through `purgeExpiredFor` below rather than importing its own
 * purgeExpiredX directly, so this is the one place the mapping needs updating.
 */
const TRASH_PROVIDERS: Record<TrashModuleKey, TrashProvider> = {
  leads: { list: listTrashedLeadsFor, restore: restoreLead, purge: purgeLead, purgeExpired: purgeExpiredLeads },
  tasks: { list: listTrashedTasksFor, restore: restoreTask, purge: purgeTask, purgeExpired: purgeExpiredTasks },
  meetings: { list: listTrashedMeetingsFor, restore: restoreMeeting, purge: purgeMeeting, purgeExpired: purgeExpiredMeetings },
  projects: { list: listTrashedProjectsFor, restore: restoreProject, purge: purgeProject, purgeExpired: purgeExpiredProjects },
  notes: { list: listTrashedNotesFor, restore: restoreNote, purge: purgeNote, purgeExpired: purgeExpiredNotes },
  quotations: { list: listTrashedQuotationsFor, restore: restoreQuotation, purge: purgeQuotation, purgeExpired: purgeExpiredQuotations },
  invoices: { list: listTrashedInvoicesFor, restore: restoreInvoice, purge: purgeInvoice, purgeExpired: purgeExpiredInvoices },
  calls: { list: listTrashedCallsFor, restore: restoreCall, purge: purgeCall, purgeExpired: purgeExpiredCalls },
  expenses: { list: listTrashedExpensesFor, restore: restoreExpense, purge: purgeExpense, purgeExpired: purgeExpiredExpenses },
  forms: { list: listTrashedFormsFor, restore: restoreForm, purge: purgeForm, purgeExpired: purgeExpiredForms },
  passwords: {
    list: listTrashedPasswordEntriesFor,
    restore: restorePasswordEntry,
    purge: purgePasswordEntry,
    purgeExpired: purgeExpiredPasswordEntries,
  },
  clients: { list: listTrashedClientsFor, restore: restoreClient, purge: purgeClient, purgeExpired: purgeExpiredClients },
  socialClients: {
    list: listTrashedSocialClientsFor,
    restore: restoreSocialClient,
    purge: purgeSocialClient,
    purgeExpired: purgeExpiredSocialClients,
  },
  socialContent: {
    list: listTrashedSocialContentFor,
    restore: restoreSocialContent,
    purge: purgeSocialContent,
    purgeExpired: purgeExpiredSocialContent,
  },
  socialAds: { list: listTrashedSocialAdsFor, restore: restoreSocialAd, purge: purgeSocialAd, purgeExpired: purgeExpiredSocialAds },
  socialReports: {
    list: listTrashedSocialReportsFor,
    restore: restoreSocialReport,
    purge: purgeSocialReport,
    purgeExpired: purgeExpiredSocialReports,
  },
  leaveRequests: {
    list: listTrashedLeaveRequestsFor,
    restore: restoreLeaveRequest,
    purge: purgeLeaveRequest,
    purgeExpired: purgeExpiredLeaveRequests,
  },
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

/** The 30-day auto-purge job's actual work for one module — what every purge-trash/route.ts calls through. */
export async function purgeExpiredFor(module: TrashModuleKey): Promise<number> {
  return TRASH_PROVIDERS[module].purgeExpired();
}
