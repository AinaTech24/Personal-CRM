import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await db.appSettings.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    settings: {
      // Show the env value as the effective setting when nothing is stored, so the
      // field reflects what the app actually uses rather than looking unconfigured.
      appUrl: row?.appUrl ?? process.env.APP_URL ?? "",
      isFromEnv: !row?.appUrl,
    },
  });
}

const bodySchema = z.object({
  appUrl: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(v), "Must be a valid http(s) URL"),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // This URL is embedded in invite emails, so a bad value points recipients at
  // someone else's host. Only http(s) absolute URLs get through, and clearing the
  // field falls back to APP_URL rather than storing an empty string.
  const appUrl = parsed.data.appUrl || null;

  await db.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", appUrl },
    update: { appUrl },
  });

  return NextResponse.json({ ok: true });
}
