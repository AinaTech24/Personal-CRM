import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser, logSocialClientActivity } from "@/lib/social-media";
import { decryptSecret } from "@/lib/crypto";

/**
 * The only route that ever returns a decrypted platform password — one row
 * at a time, on an explicit click (the eye icon), never as part of a bulk
 * fetch. Every reveal is logged to the client's activity timeline so there's
 * a record of who looked at a credential and when, same as the admin PIN
 * reveal earlier this session logs nothing extra only because that one is
 * shown once at generation time; this one can be viewed repeatedly, so the
 * audit trail matters more here.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; platformId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, platformId } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const platform = await db.socialPlatformAccount.findUnique({ where: { id: platformId } });
  if (!platform || platform.clientId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!platform.encryptedCredentials) return NextResponse.json({ error: "No password stored for this platform" }, { status: 404 });

  let password: string;
  try {
    password = decryptSecret(platform.encryptedCredentials);
  } catch (err) {
    console.error("[api/social/.../reveal] decrypt failed:", err);
    return NextResponse.json({ error: "Couldn't decrypt the stored credential" }, { status: 500 });
  }

  await logSocialClientActivity(id, user.id, "credentials_revealed", { platform: platform.platform });

  return NextResponse.json({ password });
}
