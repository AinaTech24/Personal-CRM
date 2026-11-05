import {
  IconLeads,
  IconTasks,
  IconProjects,
  IconCalendar,
  IconClock,
  IconBuilding,
  IconNotes,
  IconWallet,
  IconCake,
  IconLayoutGrid,
} from "@/components/icons";

export type DashboardModuleKey =
  | "leads"
  | "tasks"
  | "meetings"
  | "projects"
  | "attendance"
  | "clients"
  | "notes"
  | "expenses"
  | "birthdays"
  | "leaves"
  | "forms";

/** The modules the dashboard's filters can scope to — shared so the
 *  module-browsing filter and the per-user view agree on labels and icons.
 *  Every one of these is offered to every viewer; what each actually
 *  returns is scoped server-side (own records, department, or company-wide)
 *  per /api/dashboard/activity, the same way that module's own page scopes
 *  itself for that viewer. */
export const DASHBOARD_MODULES: {
  key: DashboardModuleKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "leads", label: "Leads", icon: IconLeads },
  { key: "tasks", label: "Tasks", icon: IconTasks },
  { key: "meetings", label: "Meetings", icon: IconCalendar },
  { key: "projects", label: "Projects", icon: IconProjects },
  { key: "attendance", label: "Attendance", icon: IconClock },
  { key: "clients", label: "Clients", icon: IconBuilding },
  { key: "notes", label: "Notes", icon: IconNotes },
  { key: "expenses", label: "Expenses", icon: IconWallet },
  { key: "birthdays", label: "Birthdays", icon: IconCake },
  { key: "leaves", label: "Leaves", icon: IconCalendar },
  { key: "forms", label: "Forms", icon: IconLayoutGrid },
];
