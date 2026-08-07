import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, getSocialClientForUser, logSocialClientActivity } from "@/lib/social-media";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await getSocialMembership(user.id);
  const access = await getSocialClientForUser(user, membership, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const folders = await db.socialClientFolder.findMany({
    where: { clientId: id },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { images: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ folders });
}

const bodySchema = z.object({ name: z.string().min(1).max(100) });

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

  const folder = await db.socialClientFolder.create({
    data: { clientId: id, name: parsed.data.name, createdById: user.id },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { images: true } },
    },
  });

  await logSocialClientActivity(id, user.id, "folder_created", { folderId: folder.id, name: folder.name });

  return NextResponse.json({ folder }, { status: 201 });
}
