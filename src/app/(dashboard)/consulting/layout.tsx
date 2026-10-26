import { redirect } from "next/navigation";
import { can, hasAnyRole, isAdminActor } from "@/lib/mfd/access";
import { getActor } from "@/lib/mfd/actor";
import { NAV_MODULES } from "@/lib/mfd/catalog";
import { ModuleNav, type NavGroup } from "@/components/consulting/module-nav";

const PHASES: Record<string, string> = {
  P0: "Foundation",
  P1: "Client & delivery core",
  P2: "Diagnostics",
  P3: "Implementation",
  P4: "Outcomes",
};

const ADMIN_TABLES: { table: string; label: string; code: string }[] = [
  { table: "role_assignments", label: "Role assignments", code: "ROLE" },
  { table: "client_access_grants", label: "MFD access grants", code: "GRANT" },
  { table: "scoring_schemes", label: "Scoring schemes", code: "SCHEME" },
  { table: "kpi_definitions", label: "KPI definitions", code: "KPI" },
  { table: "retention_holds", label: "Retention holds", code: "HOLD" },
  { table: "audit_events", label: "Audit trail", code: "AUDIT" },
  { table: "approval_audit_events", label: "Approval trail", code: "APPR" },
  { table: "outbox_events", label: "Automation events", code: "AUT" },
  { table: "notification_deliveries", label: "Notifications", code: "NOTE" },
];

/**
 * The MFD Command Centre (spec: "AINA MFD Consulting CRM"). Reachable by a
 * company Admin/Super Admin, or anyone holding a Command Centre role
 * assignment; everything inside is further limited by the spec's
 * role × CRUAPE matrix and MFD access grants.
 */
export default async function ConsultingLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!hasAnyRole(actor)) redirect("/");

  const groups: NavGroup[] = [];
  for (const [phase, label] of Object.entries(PHASES)) {
    const items = NAV_MODULES.filter((m) => m.phase === phase && can(actor, m.table, "R")).map((m) => ({ table: m.table, label: m.label, code: m.code }));
    if (items.length) groups.push({ label, items });
  }
  const admin = ADMIN_TABLES.filter((t) => can(actor, t.table, "R"));
  if (admin.length) groups.push({ label: isAdminActor(actor) ? "Administration" : "Reference", items: admin });

  return (
    <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
        <ModuleNav groups={groups} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
