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
  /** Hide the delete action — for records with no delete endpoint (attendance). */
  noDelete?: boolean;
  /** Where a row opens, if it has a page of its own. */
  hrefFor?: (id: string) => string;
  columns: ModuleColumn[];
  /** Label used in the delete confirmation. */
  nameOf: (row: Record<string, unknown>) => string;
  /**
   * Columns that get no filter. Everything else does.
   *
   * Free text is the usual reason — a name or a description has a different
   * value in every row, so a filter there is just the table again as a
   * dropdown. Search covers those.
   */
  noFilter?: string[];
}

/** Reads a possibly-nested value without pulling in a dependency. */
function pick(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, row);
}

const text = (path: string, fallback = "") => (row: Record<string, unknown>) => {
  const v = pick(row, path);
  if (v === null || v === undefined || v === "") return fallback;
  return String(v);
};

const date = (path: string) => (row: Record<string, unknown>) => {
  const v = pick(row, path);
  if (!v) return "";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
};

const time = (path: string) => (row: Record<string, unknown>) => {
  const v = pick(row, path);
  if (!v) return "";
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const money = (path: string) => (row: Record<string, unknown>) => {
  const v = pick(row, path);
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return Number.isNaN(n) ? "" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

/** Turns SCREAMING_SNAKE enums into something readable. */
const label = (path: string) => (row: Record<string, unknown>) => {
  const v = pick(row, path);
  if (!v) return "";
  return String(v).replace(/_/g, " ").toLowerCase();
};

/** First non-empty of several paths — e.g. an override status, else the computed one. */
const firstOf = (...paths: string[]) => (row: Record<string, unknown>) => {
  for (const p of paths) {
    const v = pick(row, p);
    if (v !== null && v !== undefined && v !== "") return String(v).replace(/_/g, " ").toLowerCase();
  }
  return "";
};

/** Yes/no reading of a boolean field. */
const bool = (path: string, yes: string, no: string) => (row: Record<string, unknown>) =>
  pick(row, path) ? yes : no;

/** Full name with surname when present. `prefix` is "" for a root name/surname,
 *  or a relation like "user" for user.name / user.surname. */
const personName = (prefix = "") => (row: Record<string, unknown>) => {
  const base = prefix ? `${prefix}.` : "";
  const name = pick(row, `${base}name`);
  if (!name) return "";
  const surname = pick(row, `${base}surname`);
  return surname ? `${name} ${surname}` : String(name);
};

export const ADMIN_MODULES: ModuleConfig[] = [
  {
    key: "users",
    label: "Users",
    listPath: "/api/users",
    listKey: "users",
    basePath: "/api/users",
    hrefFor: () => "/admin/users",
    columns: [
      { key: "name", label: "Name", get: personName() },
      { key: "email", label: "Email", get: text("email"), secondary: true },
      { key: "role", label: "Role", get: label("role") },
      { key: "department", label: "Department", get: text("department.name"), secondary: true },
      { key: "status", label: "Status", get: bool("isActive", "active", "inactive") },
      { key: "created", label: "Joined", get: date("createdAt"), secondary: true },
    ],
    nameOf: personName(),
    noFilter: ["name", "email"],
  },
  {
    key: "leads",
    label: "Leads",
    noFilter: ["name", "email"],
    listPath: "/api/leads",
    listKey: "leads",
    basePath: "/api/leads",
    hrefFor: () => "/leads",
    nameOf: (r) => text("name")(r),
    columns: [
      { key: "name", label: "Name", get: text("name") },
      { key: "company", label: "Company", get: text("company"), secondary: true },
      { key: "status", label: "Status", get: label("status") },
      { key: "assignedTo", label: "Assigned to", get: text("assignedTo.name"), secondary: true },
      { key: "assignedBy", label: "Assigned by", get: text("createdBy.name"), secondary: true },
      { key: "created", label: "Created", get: date("createdAt"), secondary: true },
    ],
  },
  {
    key: "tasks",
    label: "Tasks",
    noFilter: ["title", "description"],
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
      { key: "assignedBy", label: "Assigned by", get: text("createdBy.name"), secondary: true },
      { key: "due", label: "Due", get: date("dueDate"), secondary: true },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    noFilter: ["name", "description", "progress"],
    listPath: "/api/projects",
    listKey: "projects",
    basePath: "/api/projects",
    hrefFor: (id) => `/projects/${id}`,
    nameOf: (r) => text("name")(r),
    columns: [
      { key: "name", label: "Name", get: text("name") },
      { key: "status", label: "Status", get: label("status") },
      { key: "department", label: "Department", get: text("department.name"), secondary: true },
      { key: "assignedTo", label: "Assigned to", get: text("assignedTo.name"), secondary: true },
      { key: "assignedBy", label: "Assigned by", get: text("createdBy.name"), secondary: true },
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
    noFilter: ["clientAddress", "shipToAddress", "subject"],
    listPath: "/api/quotations",
    listKey: "quotations",
    basePath: "/api/quotations",
    hrefFor: () => "/quotations",
    nameOf: (r) => text("quotationNumber")(r),
    columns: [
      { key: "quotationNumber", label: "Quotation number", get: text("quotationNumber") },
      { key: "client", label: "Client", get: text("clientName"), secondary: true },
      { key: "status", label: "Status", get: label("status") },
      { key: "total", label: "Total", get: money("total"), secondary: true },
    ],
  },
  {
    key: "invoices",
    label: "Invoices",
    noFilter: ["invoiceNumber", "total"],
    listPath: "/api/invoices",
    listKey: "invoices",
    basePath: "/api/invoices",
    hrefFor: () => "/invoices",
    nameOf: (r) => text("invoiceNumber")(r),
    columns: [
      { key: "invoiceNumber", label: "Invoice number", get: text("invoiceNumber") },
      { key: "client", label: "Client", get: text("clientName"), secondary: true },
      { key: "status", label: "Status", get: label("status") },
      { key: "total", label: "Total", get: money("total"), secondary: true },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    listPath: "/api/attendance",
    listKey: "records",
    basePath: "/api/attendance",
    // Attendance records aren't deleted from here — there's no delete endpoint,
    // and a missing day is data, not clutter.
    noDelete: true,
    hrefFor: () => "/admin/attendance",
    columns: [
      { key: "user", label: "User", get: personName("user") },
      { key: "date", label: "Date", get: date("date") },
      { key: "status", label: "Status", get: firstOf("status", "calculatedStatus") },
      { key: "checkIn", label: "Check in", get: time("checkIn"), secondary: true },
      { key: "checkOut", label: "Check out", get: time("checkOut"), secondary: true },
      { key: "approval", label: "Approval", get: label("approvalStatus"), secondary: true },
    ],
    nameOf: (row) => `${personName("user")(row)}'s attendance`,
    noFilter: ["user", "date", "checkIn", "checkOut"],
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
