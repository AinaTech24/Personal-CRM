/**
 * What the admin Modules console can manage.
 *
 * One config per entity rather than nine bespoke screens: they all need the
 * same list / open / delete, and duplicating that nine times guarantees they
 * drift. Each entry says where to read from, what to show, and where a row
 * goes when you open it.
 *
 * Reads and deletes go through the entity's own endpoints, so the permission
 * rules that already govern them apply here too — this console is a different
 * door onto the same API, not a way around it.
 */

export interface ModuleColumn {
  key: string;
  label: string;
  /** Renders the cell; receives the whole record so it can reach nested fields. */
  get: (row: Record<string, unknown>) => string;
  /** Hidden below `sm` — keeps a phone to the columns that identify a row. */
  secondary?: boolean;
}

export interface ModuleConfig {
  key: string;
  label: string;
  /** List endpoint. Expected to return { <listKey>: [...] }. */
  listPath: string;
  listKey: string;
  /** DELETE goes to `${basePath}/${id}`. */
  basePath: string;
  /** Where a row opens, if it has a page of its own. */
  hrefFor?: (id: string) => string;
  columns: ModuleColumn[];
  /** Label used in the delete confirmation. */
  nameOf: (row: Record<string, unknown>) => string;
}

/** Reads a possibly-nested value without pulling in a dependency. */
function pick(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, row);
}

const text = (path: string, fallback = "—") => (row: Record<string, unknown>) => {
  const v = pick(row, path);
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
};

const date = (path: string) => (row: Record<string, unknown>) => {
  const v = pick(row, path);
  if (!v) return "—";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
};

const money = (path: string) => (row: Record<string, unknown>) => {
  const v = pick(row, path);
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return Number.isNaN(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

/** Turns SCREAMING_SNAKE enums into something readable. */
const label = (path: string) => (row: Record<string, unknown>) => {
  const v = pick(row, path);
  if (!v) return "—";
  return String(v).replace(/_/g, " ").toLowerCase();
};

export const ADMIN_MODULES: ModuleConfig[] = [
  {
    key: "leads",
    label: "Leads",
    listPath: "/api/leads",
    listKey: "leads",
    basePath: "/api/leads",
    hrefFor: () => "/leads",
    nameOf: (r) => text("name")(r),
    columns: [
      { key: "name", label: "Name", get: text("name") },
      { key: "company", label: "Company", get: text("company"), secondary: true },
      { key: "status", label: "Status", get: label("status") },
      { key: "owner", label: "Owner", get: text("assignedTo.name"), secondary: true },
      { key: "created", label: "Created", get: date("createdAt"), secondary: true },
    ],
  },
  {
    key: "tasks",
    label: "Tasks",
    listPath: "/api/tasks",
    listKey: "tasks",
    basePath: "/api/tasks",
    hrefFor: () => "/tasks",
    nameOf: (r) => text("title")(r),
    columns: [
      { key: "title", label: "Title", get: text("title") },
      { key: "status", label: "Status", get: label("status") },
      { key: "priority", label: "Priority", get: label("priority"), secondary: true },
      { key: "assignee", label: "Assigned to", get: text("assignedTo.name"), secondary: true },
      { key: "due", label: "Due", get: date("dueDate"), secondary: true },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    listPath: "/api/projects",
    listKey: "projects",
    basePath: "/api/projects",
    hrefFor: (id) => `/projects/${id}`,
    nameOf: (r) => text("name")(r),
    columns: [
      { key: "name", label: "Name", get: text("name") },
      { key: "status", label: "Status", get: label("status") },
      { key: "department", label: "Department", get: text("department.name"), secondary: true },
      { key: "created", label: "Created", get: date("createdAt"), secondary: true },
    ],
  },
  {
    key: "meetings",
    label: "Meetings",
    listPath: "/api/meetings",
    listKey: "meetings",
    basePath: "/api/meetings",
    hrefFor: () => "/meetings",
    nameOf: (r) => text("title")(r),
    columns: [
      { key: "title", label: "Title", get: text("title") },
      { key: "status", label: "Status", get: label("status") },
      { key: "organizer", label: "Organizer", get: text("organizer.name"), secondary: true },
      { key: "startsAt", label: "Starts", get: date("startsAt"), secondary: true },
    ],
  },
  {
    key: "quotations",
    label: "Quotations",
    listPath: "/api/quotations",
    listKey: "quotations",
    basePath: "/api/quotations",
    hrefFor: () => "/quotations",
    nameOf: (r) => text("quotationNumber")(r),
    columns: [
      { key: "number", label: "Number", get: text("quotationNumber") },
      { key: "client", label: "Client", get: text("clientName"), secondary: true },
      { key: "status", label: "Status", get: label("status") },
      { key: "total", label: "Total", get: money("total"), secondary: true },
    ],
  },
  {
    key: "invoices",
    label: "Invoices",
    listPath: "/api/invoices",
    listKey: "invoices",
    basePath: "/api/invoices",
    hrefFor: () => "/invoices",
    nameOf: (r) => text("invoiceNumber")(r),
    columns: [
      { key: "number", label: "Number", get: text("invoiceNumber") },
      { key: "client", label: "Client", get: text("clientName"), secondary: true },
      { key: "status", label: "Status", get: label("status") },
      { key: "total", label: "Total", get: money("total"), secondary: true },
    ],
  },
  {
    key: "departments",
    label: "Departments",
    listPath: "/api/departments",
    listKey: "departments",
    basePath: "/api/departments",
    nameOf: (r) => text("name")(r),
    columns: [
      { key: "name", label: "Name", get: text("name") },
      { key: "slug", label: "Slug", get: text("slug"), secondary: true },
      { key: "users", label: "People", get: text("_count.users", "0") },
    ],
  },
];

export function moduleByKey(key: string) {
  return ADMIN_MODULES.find((m) => m.key === key) ?? ADMIN_MODULES[0];
}
