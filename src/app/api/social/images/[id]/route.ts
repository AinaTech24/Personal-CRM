import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialImageForUser, getSocialFolderForUser, logSocialClientActivity } from "@/lib/social-media";

const patchSchema = z.object({
  fileName: z.string().min(1).max(150).optional(),
  /** Moves the image into a different folder — must belong to the same client. */
  folderId: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialImageForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  let clientId: string;
  if (data.folderId !== undefined && data.folderId !== access.folderId) {
    const targetFolder = await getSocialFolderForUser(user, membership, data.folderId);
    if (targetFolder === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!targetFolder) return NextResponse.json({ error: "Destination folder not found" }, { status: 404 });
    const currentFolder = await db.socialClientFolder.findUnique({ where: { id: access.folderId }, select: { clientId: true } });
    if (targetFolder.clientId !== currentFolder?.clientId) {
      return NextResponse.json({ error: "Can't move an image to a different client's folder" }, { status: 400 });
    }
    clientId = targetFolder.clientId;
  } else {
    const folder = await db.socialClientFolder.findUnique({ where: { id: access.folderId }, select: { clientId: true } });
    clientId = folder!.clientId;
  }

  const image = await db.socialClientImage.update({
    where: { id },
    data: {
      ...(data.fileName !== undefined && { fileName: data.fileName }),
      ...(data.folderId !== undefined && { folderId: data.folderId }),
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
    omit: { data: true },
  });

  await logSocialClientActivity(
    clientId,
    user.id,
    data.folderId !== undefined && data.folderId !== access.folderId ? "image_moved" : "image_renamed",
    { imageId: id, fileName: image.fileName }
  );

  return NextResponse.json({ image });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialImageForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const folder = await db.socialClientFolder.findUnique({ where: { id: access.folderId }, select: { clientId: true } });

  await db.socialClientImage.delete({ where: { id } });
  if (folder) {
    await logSocialClientActivity(folder.clientId, user.id, "image_deleted", { imageId: id, fileName: access.fileName });
  }

  return NextResponse.json({ ok: true });
}
