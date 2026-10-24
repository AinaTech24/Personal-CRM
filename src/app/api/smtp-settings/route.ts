import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { encryptSecret } from "@/lib/crypto";

const SETTINGS_ID = "default";

/** Never send the stored password to the client; expose only whether one is set. */
function serialize(s: {
  host: string | null;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromEmail: string | null;
  fromName: string | null;
  allowExternalInvites: boolean;
} | null) {
  return {
    host: s?.host ?? "",
    port: s?.port ?? 587,
    secure: s?.secure ?? false,
    username: s?.username ?? "",
    fromEmail: s?.fromEmail ?? "",
    fromName: s?.fromName ?? "Aina CRM",
    hasPassword: !!s?.password,
    allowExternalInvites: s?.allowExternalInvites ?? false,
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await db.smtpSettings.findUnique({ where: { id: SETTINGS_ID } });
  return NextResponse.json({ settings: serialize(settings) });
}

const putSchema = z.object({
  host: z.string().max(200).optional().nullable(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  username: z.string().max(200).optional().nullable(),
  // Empty string means "leave the existing password unchanged".
  password: z.string().max(400).optional().nullable(),
  fromEmail: z.string().max(200).optional().nullable(),
  fromName: z.string().max(200).optional().nullable(),
  allowExternalInvites: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const base = {
    host: d.host || null,
    port: d.port ?? 587,
    secure: d.secure ?? false,
    username: d.username || null,
    fromEmail: d.fromEmail || null,
    fromName: d.fromName || "Aina CRM",
    allowExternalInvites: d.allowExternalInvites ?? false,
  };

  const settings = await db.smtpSettings.upsert({
    where: { id: SETTINGS_ID },
    // Only overwrite the password when a non-empty value is supplied.
    create: { id: SETTINGS_ID, ...base, password: d.password ? encryptSecret(d.password) : null },
    update: { ...base, ...(d.password ? { password: encryptSecret(d.password) } : {}) },
  });

  return NextResponse.json({ settings: serialize(settings) });
}
