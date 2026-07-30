import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser, logSocialClientActivity } from "@/lib/social-media";
import { encryptSecret, credentialsEncryptionConfigured } from "@/lib/crypto";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The ciphertext itself never leaves the server in a bulk fetch — only the
  // dedicated reveal route (platforms/[platformId]/reveal) ever decrypts and
  // returns a password, and it does that one row at a time, logged.
  const platforms = await db.socialPlatformAccount.findMany({
    where: { clientId: id },
    omit: { encryptedCredentials: true },
    orderBy: { platform: "asc" },
  });
  return NextResponse.json({ platforms });
}

const bodySchema = z.object({
  platform: z.enum(["FACEBOOK", "INSTAGRAM", "LINKEDIN", "TWITTER", "YOUTUBE"]),
  handle: z.string().max(120).optional().nullable(),
  credentialsReceived: z.boolean().optional(),
  /** Omitted = leave whatever's already stored untouched; empty string clears it. */
  password: z.string().max(500).optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  if (data.password && !credentialsEncryptionConfigured) {
    return NextResponse.json({ error: "Credential storage isn't configured on this server" }, { status: 500 });
  }

  // A password field left untouched shouldn't wipe what's already saved —
  // only write the credential columns when the caller actually sent one.
  const credentialFields =
    data.password !== undefined
      ? {
          encryptedCredentials: data.password ? encryptSecret(data.password) : null,
          credentialsUpdatedAt: data.password ? new Date() : null,
          credentialsUpdatedById: data.password ? user.id : null,
          // Typing a real password in is itself evidence credentials were received.
          credentialsReceived: data.password ? true : (data.credentialsReceived ?? false),
        }
      : { credentialsReceived: data.credentialsReceived ?? false };

  const platformAccount = await db.socialPlatformAccount.upsert({
    where: { clientId_platform: { clientId: id, platform: data.platform } },
    create: {
      clientId: id,
      platform: data.platform,
      handle: data.handle || null,
      notes: data.notes || null,
      ...credentialFields,
    },
    update: {
      handle: data.handle || null,
      notes: data.notes || null,
      ...credentialFields,
    },
    omit: { encryptedCredentials: true },
  });

  await logSocialClientActivity(id, user.id, "platform_updated", { platform: data.platform });

  return NextResponse.json({ platform: platformAccount }, { status: 201 });
}
