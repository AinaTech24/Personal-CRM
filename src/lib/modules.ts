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
  { key: "messages", label: "Messages" },
  { key: "notes", label: "Notes" },
  { key: "quotations", label: "Quotes" },
  { key: "invoices", label: "Invoices" },
  { key: "clients", label: "Clients" },
  { key: "passwords", label: "Passwords" },
  { key: "birthdays", label: "Birthdays" },
  { key: "attendance", label: "My Attendance" },
  { key: "leave", label: "My Leave" },
  { key: "expenses", label: "My Expenses" },
];

export const MODULE_KEYS = TOGGLEABLE_MODULES.map((m) => m.key);

/**
 * The "Default landing page" picker (Settings → Preferences) offers every
 * TOGGLEABLE_MODULES entry it can (minus "clients" — see
 * getVisibleToggleableModules in module-permissions-store.ts for why) plus
 * these: modules with no always-on nav slot of their own, only ever reached
 * through CRM/Social Media team membership, a Permission Manager grant, or a
 * Command Centre role. Kept here, next to TOGGLEABLE_MODULES, so wiring a new
 * module's nav entry (see AGENTS.md) and its landing-page option stay one
 * place to edit instead of two.
 */
export const GRANTED_LANDING_PAGE_MODULES: { href: string; label: string }[] = [
  { href: "/clients", label: "Clients" },
  { href: "/calls", label: "Calls" },
  { href: "/forms", label: "Forms" },
  { href: "/crm/team", label: "CRM Team" },
  { href: "/social-media/team", label: "Social Media Team" },
  { href: "/consulting", label: "MFD Command Centre" },
];

/**
 * Every href the landing-page picker can ever offer, to anyone — the
 * open-redirect allowlist /api/profile validates a saved choice against, and
 * the set (dashboard)/page.tsx's own redirect matches against. A superset of
 * what any one person is actually offered (see /api/auth/me's
 * landingPageOptions for the per-person filter): every choice the picker can
 * show is guaranteed to be in here, so it's guaranteed to actually redirect.
 */
export const LANDING_PAGE_HREFS: string[] = [
  ...TOGGLEABLE_MODULES.filter((m) => m.key !== "clients").map((m) => `/${m.key}`),
  ...GRANTED_LANDING_PAGE_MODULES.map((m) => m.href),
];
