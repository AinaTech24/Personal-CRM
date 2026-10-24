import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HelpDialog, HelpSection } from "@/components/ui/help-dialog";
import { AdminTools } from "@/components/consulting/admin-tools";
import { db } from "@/lib/db";
import { can, isAdminActor, scopeWhere, type Actor } from "@/lib/mfd/access";
import { getActor } from "@/lib/mfd/actor";
import { TABLES } from "@/lib/mfd/catalog";
import { listRecords, resolveLabels } from "@/lib/mfd/engine";
import { formatValue, statusTone } from "@/lib/mfd/format";
import { fieldMetas } from "@/lib/mfd/ui-meta";

const cols = (t: string) => new Set(TABLES[t].fields.map((f) => f.column));

async function count(actor: Actor, table: string, where: Record<string, unknown>) {
  if (!can(actor, table, "R")) return null;
  const d = (db as unknown as Record<string, { count(a: unknown): Promise<number> }>)[TABLES[table].delegate];
  return d.count({ where: { AND: [scopeWhere(actor, table, cols(table)), { archivedAt: null }, where] } });
}

function Tile({ label, value, href, tone }: { label: string; value: number | null; href: string; tone?: "warning" | "destructive" }) {
  if (value === null) return null;
  const color = value > 0 && tone === "destructive" ? "text-destructive" : value > 0 && tone === "warning" ? "text-amber-500" : "";
  return (
    <Link href={href} className="rounded-xl border border-border bg-card p-4 transition-colors hover:bg-primary/5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </Link>
  );
}

export default async function CommandCentrePage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const now = new Date();
  const in60 = new Date(now.getTime() + 60 * 86_400_000);

  const [orgs, leads, engagements, myTasks, overdue, toReview, criticalRisks, renewals, docsDue] = await Promise.all([
    count(actor, "mfd_organizations", { orgStatus: "active" }),
    count(actor, "leads", { status: { in: ["new", "contact_attempted", "connected", "qualified"] } }),
    count(actor, "consulting_engagements", { contractStatus: "active" }),
    actor.memberId ? count(actor, "action_tasks", { assignedMemberId: actor.memberId, status: { notIn: ["completed", "cancelled"] } }) : Promise.resolve(null),
    count(actor, "action_tasks", { dueAt: { lt: now }, status: { notIn: ["completed", "cancelled"] } }),
    count(actor, "assessments", { status: { in: ["submitted", "under_review"] } }),
    count(actor, "risks_dependencies", { severity: "critical", status: { notIn: ["resolved", "closed"] } }),
    count(actor, "consulting_engagements", { contractStatus: "active", endDate: { lte: in60 } }),
    count(actor, "document_records", { status: "requested", requestDueAt: { lt: now } }),
  ]);

  const tasks =
    actor.memberId && can(actor, "action_tasks", "R")
      ? (await listRecords(actor, "action_tasks", { filters: { assigned_member_id: actor.memberId }, archived: "exclude", sort: "due_at", dir: "asc", limit: 50, offset: 0 })).rows
          .filter((t) => !["completed", "cancelled"].includes(t.status as string))
          .slice(0, 8)
      : [];
  const taskLabels = await resolveLabels(actor, "action_tasks", tasks);
  const taskMetas = can(actor, "action_tasks", "R") ? fieldMetas(actor, "action_tasks") : [];
  const meta = (c: string) => taskMetas.find((m) => m.column === c)!;

  const starterInstalled = (await db.ccAssessmentTemplate.count({ where: { workspaceId: actor.workspaceId, templateCode: "AINA-DIAG" } })) > 0;
  const admin = isAdminActor(actor);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">MFD Command Centre</h1>
          <HelpDialog title="MFD Command Centre">
            <HelpSection heading="What this is">
              <p>
                Aina&apos;s consulting CRM for Mutual Fund Distributor clients — from lead and proposal through diagnostics, implementation, KPIs and renewal, built to the AINA MFD
                Consulting CRM field dictionary.
              </p>
            </HelpSection>
            <HelpSection heading="Who sees what">
              <ul>
                <li>Company Admins/Super Admins are Command Centre admins automatically.</li>
                <li>Everyone else needs a role assignment (Administration → Role assignments) and, for client data, an MFD access grant.</li>
                <li>Sensitive and restricted fields are hidden by role; records are never deleted, only archived; every change is audited.</li>
              </ul>
            </HelpSection>
            <HelpSection heading="Automations">
              <p>
                Qualifying a lead, winning a deal, activating an engagement, completing a session and approving an assessment draft the next pieces of work for a person to check —
                nothing is approved or shared automatically.
              </p>
            </HelpSection>
          </HelpDialog>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[...actor.roles].map((r) => (
            <Badge key={r} variant="outline">
              {r.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
      </div>

      {admin && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm">
            <p className="font-medium">Admin</p>
            <p className="text-muted-foreground">
              {starterInstalled
                ? "The AINA diagnostic template and maturity scoring scheme are installed."
                : "Install the kit's 65-checkpoint diagnostic template and maturity scoring scheme to start issuing assessments."}
            </p>
          </div>
          <AdminTools starterInstalled={starterInstalled} />
        </Card>
      )}

      {!actor.memberId && (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          You don&apos;t have an internal team profile yet, so nothing can be assigned to you.{" "}
          {can(actor, "team_members", "C") ? (
            <Link href="/consulting/team_members/new" className="text-primary hover:underline">
              Add team members
            </Link>
          ) : (
            "Ask an admin to add you under Internal Consulting Team."
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Tile label="Active MFDs" value={orgs} href="/consulting/mfd_organizations?org_status=active" />
        <Tile label="Open leads" value={leads} href="/consulting/leads" />
        <Tile label="Active engagements" value={engagements} href="/consulting/consulting_engagements?contract_status=active" />
        <Tile label="My open tasks" value={myTasks} href={`/consulting/action_tasks?assigned_member_id=${actor.memberId ?? ""}`} />
        <Tile label="Overdue tasks" value={overdue} href="/consulting/action_tasks" tone="destructive" />
        <Tile label="Assessments to review" value={toReview} href="/consulting/assessments?status=submitted" tone="warning" />
        <Tile label="Critical risks" value={criticalRisks} href="/consulting/risks_dependencies" tone="destructive" />
        <Tile label="Renewals in 60 days" value={renewals} href="/consulting/consulting_engagements?contract_status=active" tone="warning" />
        <Tile label="Overdue document requests" value={docsDue} href="/consulting/document_records?status=requested" tone="warning" />
      </div>

      {tasks.length > 0 && (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="text-base font-semibold">My tasks</h2>
          <ul className="flex flex-col divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.id as string} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/consulting/action_tasks/${t.id as string}`} className="min-w-0 truncate text-primary hover:underline">
                  {t.task_number as string} · {t.title as string}
                </Link>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {formatValue(meta("mfd_org_id"), t.mfd_org_id, taskLabels)}
                  {" · "}
                  {t.due_at ? `due ${formatValue(meta("due_at"), t.due_at)}` : "no due date"}
                  <Badge variant={statusTone(t.status)}>{formatValue(meta("status"), t.status)}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
