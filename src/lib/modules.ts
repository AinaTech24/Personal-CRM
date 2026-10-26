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
  { key: "messages", label: "Chat" },
  { key: "notes", label: "Notes" },
  { key: "quotations", label: "Quotations" },
  { key: "invoices", label: "Invoices" },
  { key: "clients", label: "Clients" },
  { key: "passwords", label: "Password Manager" },
  { key: "birthdays", label: "Birthdays" },
  { key: "attendance", label: "My Attendance" },
  { key: "leave", label: "My Leave" },
  { key: "expenses", label: "My Expenses" },
];

export const MODULE_KEYS = TOGGLEABLE_MODULES.map((m) => m.key);
