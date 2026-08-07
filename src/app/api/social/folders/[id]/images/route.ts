import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialFolderForUser, logSocialClientActivity } from "@/lib/social-media";
import { saveClientImage, UploadValidationError } from "@/lib/uploads";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialFolderForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const images = await db.socialClientImage.findMany({
    where: { folderId: id },
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    omit: { data: true },
  });

  return NextResponse.json({ images });
}

/** Adds one image to a folder. Multiple images — call once per file, same as report files. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialFolderForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  let filePath: string, fileName: string, data: string;
  try {
    ({ filePath, fileName, data } = await saveClientImage(access.clientId, file));
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const image = await db.socialClientImage.create({
    data: { folderId: id, fileName, filePath, data, uploadedById: user.id },
    include: { uploadedBy: { select: { id: true, name: true } } },
    omit: { data: true },
  });

  await logSocialClientActivity(access.clientId, user.id, "image_uploaded", { folderId: id, fileName });

  return NextResponse.json({ image }, { status: 201 });
}
