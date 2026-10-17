import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dateFromKey } from "@/lib/attendance";
import { REGISTER_KINDS, type RegisterKind } from "@/lib/consulting";
import {
  assertActiveUser,
  broadcastConsultingChange,
  closedAtFor,
  consultingUser,
  createItemWithNumber,
  itemBodySchema,
  itemInclude,
  serializeItem,
  toJson,
  validateItemForKind,
} from "@/lib/consulting-store";

type Params = { params: Promise<{ id: string }> };

/** All of an engagement's register items, or one register's with `?kind=`. */
export async function GET(req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("READ");
  if (!user) return error;

  const { id } = await params;
  const kindParam = req.nextUrl.searchParams.get("kind");
  if (kindParam && !REGISTER_KINDS.includes(kindParam as RegisterKind)) {
    return NextResponse.json({ error: "Unknown register" }, { status: 400 });
  }

  const items = await db.consultingRegisterItem.findMany({
    where: { engagementId: id, ...(kindParam && { kind: kindParam as RegisterKind }) },
    include: itemInclude,
    orderBy: [{ kind: "asc" }, { number: "asc" }],
  });
  return NextResponse.json({ items: items.map(serializeItem) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { user, error } = await consultingUser("CREATE");
  if (!user) return error;

  const { id } = await params;
  const engagement = await db.consultingEngagement.findUnique({ where: { id }, select: { id: true } });
  if (!engagement) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = itemBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const checked = validateItemForKind(d.kind, d.status, d.details ?? {});
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (!(await assertActiveUser(d.ownerId))) return NextResponse.json({ error: "Owner must be an active user" }, { status: 400 });

  const item = await createItemWithNumber({
    engagementId: id,
    kind: d.kind,
    title: d.title,
    description: d.description,
    status: d.status,
    priority: d.priority ?? null,
    ownerId: d.ownerId ?? null,
    ownerName: d.ownerName,
    dueDate: d.dueDate ? dateFromKey(d.dueDate) : null,
    closedAt: closedAtFor(d.kind, d.status, null),
    details: toJson(checked.details ?? {}),
    createdById: user.id,
  });

  await broadcastConsultingChange(id);
  return NextResponse.json({ item: serializeItem(item) }, { status: 201 });
}
