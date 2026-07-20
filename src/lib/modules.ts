/**
 * Sidebar modules an admin can hide from regular (non-admin) users. The `key`
 * matches the nav href without its leading slash (e.g. "leads" ↔ "/leads").
 * Dashboard and the Admin section are always visible and not listed here.
 */
export const TOGGLEABLE_MODULES: { key: string; label: string }[] = [
  { key: "leads", label: "Leads" },
  { key: "tasks", label: "Tasks" },
  { key: "projects", label: "Projects" },
  { key: "meetings", label: "Meetings" },
  { key: "quotations", label: "Quotations" },
  { key: "invoices", label: "Invoices" },
  { key: "attendance", label: "My Attendance" },
];

export const MODULE_KEYS = TOGGLEABLE_MODULES.map((m) => m.key);
