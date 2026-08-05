import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser, logSocialClientActivity, broadcastSocialChange } from "@/lib/social-media";

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
const CONTENT_TYPES = ["STATIC_POST", "CAROUSEL", "AI_REEL", "REAL_PERSON_REEL"] as const;
const SLOT_STATUSES = ["NOT_UPLOADED", "PENDING", "DONE"] as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get("clientId");
  const year = Number(req.nextUrl.searchParams.get("year"));
  const month = Number(req.nextUrl.searchParams.get("month"));
  if (!clientId || !year || !month) return NextResponse.json({ error: "clientId, year, and month are required" }, { status: 400 });

  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, clientId);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const slots = await db.socialContentCalendarSlot.findMany({
    where: { clientId, year, month },
    orderBy: [{ week: "asc" }, { weekday: "asc" }],
  });

  return NextResponse.json({ slots });
}

const bodySchema = z.object({
  clientId: z.string(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  week: z.number().int().min(1).max(4),
  weekday: z.enum(WEEKDAYS),
  contentType: z.enum(CONTENT_TYPES).nullable(),
  note: z.string().max(200).nullable().optional(),
  /** null/omitted keeps the automatic "#N" position within this month's same contentType. */
  manualNumber: z.number().int().min(1).max(99).nullable().optional(),
  status: z.enum(SLOT_STATUSES).optional(),
});

/** Upserts a single grid cell. An empty cell (no contentType and no note) is a delete. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, data.clientId);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const key = { clientId_year_month_week_weekday: { clientId: data.clientId, year: data.year, month: data.month, week: data.week, weekday: data.weekday } };

  if (!data.contentType && !data.note) {
    await db.socialContentCalendarSlot.deleteMany({ where: { clientId: data.clientId, year: data.year, month: data.month, week: data.week, weekday: data.weekday } });
    await logSocialClientActivity(data.clientId, user.id, "calendar_slot_cleared", { week: data.week, weekday: data.weekday });
    await broadcastSocialChange("social_calendar_updated", { clientId: data.clientId });
    return NextResponse.json({ slot: null });
  }

  const slot = await db.socialContentCalendarSlot.upsert({
    where: key,
    create: {
      clientId: data.clientId,
      year: data.year,
      month: data.month,
      week: data.week,
      weekday: data.weekday,
      contentType: data.contentType,
      note: data.contentType ? null : data.note ?? null,
      manualNumber: data.manualNumber ?? null,
      status: data.status ?? "NOT_UPLOADED",
      createdById: user.id,
    },
    update: {
      contentType: data.contentType,
      note: data.contentType ? null : data.note ?? null,
      manualNumber: data.manualNumber ?? null,
      ...(data.status !== undefined && { status: data.status }),
    },
  });

  await logSocialClientActivity(data.clientId, user.id, "calendar_slot_updated", { week: data.week, weekday: data.weekday });
  await broadcastSocialChange("social_calendar_updated", { clientId: data.clientId });

  return NextResponse.json({ slot }, { status: 201 });
}
