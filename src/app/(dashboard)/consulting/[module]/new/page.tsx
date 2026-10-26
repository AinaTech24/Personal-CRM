import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { RecordForm } from "@/components/consulting/record-form";
import { can, canUseOrg } from "@/lib/mfd/access";
import { getActor } from "@/lib/mfd/actor";
import { moduleDef, TABLES } from "@/lib/mfd/catalog";
import { resolveLabels } from "@/lib/mfd/engine";
import { formatValue, humanize } from "@/lib/mfd/format";
import { tableConfig } from "@/lib/mfd/module-config";
import { fieldMetas } from "@/lib/mfd/ui-meta";

export default async function NewRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { module: table } = await params;
  const def = TABLES[table];
  if (!def) notFound();
  const actor = await getActor();
  if (!actor) redirect("/login");
  const cfg = tableConfig(table);
  if (!can(actor, table, "C") || (cfg.mode ?? "editable") === "read-only") redirect(`/consulting/${table}`);

  const sp = await searchParams;
  const metas = fieldMetas(actor, table);
  // A pre-chosen MFD (e.g. "New" from an MFD's 360 view) is pinned, not just prefilled.
  const fixed: Record<string, unknown> = {};
  const org = typeof sp.mfd_org_id === "string" ? sp.mfd_org_id : null;
  if (org && def.fields.some((f) => f.column === "mfd_org_id") && canUseOrg(actor, org)) fixed.mfd_org_id = org;
  const labels = await resolveLabels(actor, table, [fixed]);
  const orgMeta = metas.find((m) => m.column === "mfd_org_id");
  const title = moduleDef(table)?.label ?? humanize(table);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/consulting/${table}`} className="text-xs text-muted-foreground hover:underline">
          ← {title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New record</h1>
        {fixed.mfd_org_id && orgMeta ? <p className="text-sm text-muted-foreground">For {formatValue(orgMeta, fixed.mfd_org_id, labels)}</p> : null}
      </div>
      <Card className="p-5">
        <RecordForm slug={def.slug} table={table} fields={metas} fixed={Object.keys(fixed).length ? fixed : undefined} />
      </Card>
    </div>
  );
}
