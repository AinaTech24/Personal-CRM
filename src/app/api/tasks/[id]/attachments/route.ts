import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTaskForUser } from "@/lib/tasks";
import { saveTaskAttachment } from "@/lib/uploads";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTaskForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10MB limit" }, { status: 400 });
  }

  const { filePath, fileName, data } = await saveTaskAttachment(id, file);

  const attachment = await db.taskAttachment.create({
    data: { taskId: id, fileName, filePath, data, uploadedById: user.id },
    include: { uploadedBy: { select: { name: true } } },
    omit: { data: true },
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
