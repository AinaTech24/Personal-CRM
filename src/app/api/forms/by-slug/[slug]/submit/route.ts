import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  AttachmentUploadError,
  MAX_DATA_URL_FILES_PER_FIELD,
  MAX_DATA_URL_TOTAL_BYTES,
  parseAttachmentDataUrl,
  sanitizeAttachmentFileName,
} from "@/lib/uploads";

interface PickedFile {
  fileName: string;
  dataUrl: string;
}

function isPickedFile(v: unknown): v is PickedFile {
  return !!v && typeof v === "object" && typeof (v as PickedFile).fileName === "string" && typeof (v as PickedFile).dataUrl === "string";
}

/** Public — no login required. Validates and stores one visitor's answers to a live form. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await db.form.findUnique({ where: { slug }, include: { fields: { orderBy: { order: "asc" } } } });
  if (!form || !form.isActive) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const answersInput = body && typeof body === "object" ? ((body as { answers?: Record<string, unknown> }).answers ?? {}) : {};

  const answerRows: { fieldId: string; value: string }[] = [];
  const attachmentRows: { fieldId: string; fileName: string; data: string }[] = [];
  let totalBytes = 0;

  for (const field of form.fields) {
    if (field.type === "SECTION_HEADING") continue;
    const raw = answersInput[field.id];

    if (field.type === "FILE_SINGLE" || field.type === "FILE_MULTI") {
      const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(isPickedFile);
      if (field.required && files.length === 0) {
        return NextResponse.json({ error: `"${field.label}" is required` }, { status: 400 });
      }
      if (field.type === "FILE_SINGLE" && files.length > 1) {
        return NextResponse.json({ error: `"${field.label}" accepts only one file` }, { status: 400 });
      }
      if (files.length > MAX_DATA_URL_FILES_PER_FIELD) {
        return NextResponse.json({ error: `"${field.label}" allows up to ${MAX_DATA_URL_FILES_PER_FIELD} files` }, { status: 400 });
      }
      try {
        for (const f of files) {
          const { base64, bytes } = parseAttachmentDataUrl(f.dataUrl, f.fileName);
          totalBytes += bytes;
          if (totalBytes > MAX_DATA_URL_TOTAL_BYTES) {
            throw new AttachmentUploadError(`Attachments exceed the ${MAX_DATA_URL_TOTAL_BYTES / (1024 * 1024)}MB total limit`);
          }
          attachmentRows.push({ fieldId: field.id, fileName: sanitizeAttachmentFileName(f.fileName), data: base64 });
        }
      } catch (err) {
        if (err instanceof AttachmentUploadError) return NextResponse.json({ error: err.message }, { status: 400 });
        throw err;
      }
      continue;
    }

    if (field.type === "CHECKBOX") {
      const selected = Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0) : [];
      if (field.required && selected.length === 0) {
        return NextResponse.json({ error: `"${field.label}" is required` }, { status: 400 });
      }
      if (selected.length > 0) answerRows.push({ fieldId: field.id, value: selected.join("|") });
      continue;
    }

    const value = typeof raw === "string" ? raw.trim() : "";
    if (field.required && !value) return NextResponse.json({ error: `"${field.label}" is required` }, { status: 400 });
    if (value.length > 5000) return NextResponse.json({ error: `"${field.label}" is too long` }, { status: 400 });
    if (value) answerRows.push({ fieldId: field.id, value });
  }

  const submission = await db.formSubmission.create({
    data: { formId: form.id, answers: { create: answerRows }, attachments: { create: attachmentRows } },
    select: { id: true },
  });

  return NextResponse.json({ id: submission.id }, { status: 201 });
}
