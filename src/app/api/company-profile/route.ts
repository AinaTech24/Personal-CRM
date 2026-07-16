import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

const PROFILE_ID = "default";

/** Returns the singleton company profile, creating an empty one on first access. */
async function getOrCreateProfile() {
  const existing = await db.companyProfile.findUnique({ where: { id: PROFILE_ID } });
  if (existing) return existing;
  return db.companyProfile.create({ data: { id: PROFILE_ID, name: "" } });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrCreateProfile();
  return NextResponse.json({ profile });
}

// Data URLs can be large (base64 logo/signature); cap to keep the row sane.
const MAX_DATA_URL = 1_500_000;
const dataUrl = z
  .string()
  .max(MAX_DATA_URL)
  .regex(/^data:image\//, "Must be an image data URL")
  .nullable()
  .optional();

const bodySchema = z.object({
  name: z.string().max(200).optional(),
  addressLines: z.string().max(1000).nullable().optional(),
  gstin: z.string().max(30).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(120).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  signatoryName: z.string().max(120).nullable().optional(),
  logoDataUrl: dataUrl,
  signatureDataUrl: dataUrl,
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "Only an admin can edit the company profile" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  await getOrCreateProfile();
  const profile = await db.companyProfile.update({
    where: { id: PROFILE_ID },
    data: parsed.data,
  });

  return NextResponse.json({ profile });
}
