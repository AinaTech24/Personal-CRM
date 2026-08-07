import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialFolderForUser, logSocialClientActivity } from "@/lib/social-media";

const patchSchema = z.object({ name: z.string().min(1).max(100) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialFolderForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const folder = await db.socialClientFolder.update({
    where: { id },
    data: { name: parsed.data.name },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { images: true } },
    },
  });

  await logSocialClientActivity(access.clientId, user.id, "folder_renamed", { folderId: id, name: folder.name });

  return NextResponse.json({ folder });
}

/** Deleting a folder cascades to every image inside it — the client warns about this before confirming. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialFolderForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.socialClientFolder.delete({ where: { id } });
  await logSocialClientActivity(access.clientId, user.id, "folder_deleted", { folderId: id, name: access.name });

  return NextResponse.json({ ok: true });
}
