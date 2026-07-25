import {
  IconLeads,
  IconTasks,
  IconProjects,
  IconCalendar,
  IconClock,
} from "@/components/icons";

export type DashboardModuleKey = "leads" | "tasks" | "meetings" | "projects" | "attendance";

/** The five modules the dashboard's filters can scope to — shared so the
 *  module-browsing filter and the per-user view agree on labels and icons. */
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
];
