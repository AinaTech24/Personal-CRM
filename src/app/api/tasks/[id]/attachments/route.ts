import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getTaskForUser } from "@/lib/tasks";
import { saveTaskAttachment, UploadValidationError } from "@/lib/uploads";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getTaskForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A link comes in as JSON; an upload as multipart. Branch on content type so
  // one endpoint covers both kinds of attachment.
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => null);
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    if (!rawUrl) return NextResponse.json({ error: "No link provided" }, { status: 400 });

    // Accept "example.com/x" by assuming https, the way a browser bar would.
    const candidate = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return NextResponse.json({ error: "That doesn't look like a valid link" }, { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Only http and https links are allowed" }, { status: 400 });
    }

    const label = typeof body?.label === "string" && body.label.trim() ? body.label.trim() : parsed.hostname;
    const linkAttachment = await db.taskAttachment.create({
      data: {
        taskId: id,
        fileName: label.slice(0, 255),
        filePath: parsed.toString(),
        url: parsed.toString(),
        uploadedById: user.id,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
      omit: { data: true },
    });
    return NextResponse.json({ attachment: linkAttachment }, { status: 201 });
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File exceeds the 10MB limit" }, { status: 400 });
  }

  let filePath: string, fileName: string, data: string;
  try {
    ({ filePath, fileName, data } = await saveTaskAttachment(id, file));
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  const attachment = await db.taskAttachment.create({
    data: { taskId: id, fileName, filePath, data, uploadedById: user.id },
    include: { uploadedBy: { select: { id: true, name: true } } },
    omit: { data: true },
  });

  return NextResponse.json({ attachment }, { status: 201 });
}
