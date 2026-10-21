import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getProjectForUser, logProjectActivity } from "@/lib/projects";
import { saveProjectDocument, UploadValidationError } from "@/lib/uploads";
import { notifyAndPush } from "@/lib/notify";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectForUser(user, id, "UPDATE");
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

  let filePath: string, fileName: string, data: string;
  try {
    ({ filePath, fileName, data } = await saveProjectDocument(id, file));
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // Optional custom display name; keeps the original extension if the user omits it.
  const customName = (formData?.get("fileName") as string | null)?.trim();
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
  const displayName = customName ? (customName.includes(".") ? customName : customName + ext) : fileName;

  const document = await db.projectDocument.create({
    data: { projectId: id, fileName: displayName, filePath, data, uploadedById: user.id },
    include: { uploadedBy: { select: { name: true } } },
    omit: { data: true },
  });

  await logProjectActivity(id, user.id, "document_added", { fileName });

  // The people actually responsible for the project — creator and assignee
  // — hear about a new document; not every member, to avoid a notification
  // per file for a project with a large roster.
  const recipientIds = new Set([access.createdById, ...(access.assignedToId ? [access.assignedToId] : [])]);
  recipientIds.delete(user.id);
  await Promise.all(
    Array.from(recipientIds).map((recipientId) =>
      notifyAndPush(
        recipientId,
        "project_document_added",
        { projectId: id, projectName: access.name, fileName: displayName, actorName: user.name },
        {
          title: "New project document",
          body: `${user.name} added "${displayName}" to "${access.name}"`,
          url: `/projects/${id}`,
          tag: "project-document-added",
        }
      )
    )
  );

  return NextResponse.json({ document }, { status: 201 });
}
