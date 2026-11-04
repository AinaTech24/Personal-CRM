import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  AttachmentUploadError,
  MAX_DATA_URL_FILES_PER_FIELD,
  MAX_DATA_URL_TOTAL_BYTES,
  parseAttachmentDataUrl,
  sanitizeAttachmentFileName,
} from "@/lib/uploads";
import { notifyAndPush } from "@/lib/notify";
import { requestDevice } from "@/lib/request-info";
import { rateLimit } from "@/lib/rate-limit";
import { detectSubmitterName, isFieldVisible, parseFieldOptions, validateFieldValue } from "@/lib/form-fields";
import { formManagerIds } from "@/lib/form-notify";

interface PickedFile {
  fileName: string;
  dataUrl: string;
}

function isPickedFile(v: unknown): v is PickedFile {
  return !!v && typeof v === "object" && typeof (v as PickedFile).fileName === "string" && typeof (v as PickedFile).dataUrl === "string";
}

// 8 submissions / 10 minutes per IP per form — this endpoint is public (no
// login, no CAPTCHA), so without a cap a scripted flood could both bloat the
// database and spam every viewer's notification bell/push device.
const LIMIT = 8;
const WINDOW_MS = 10 * 60 * 1000;

/**
 * The CORS preflight for a cross-origin fetch() POST (the standalone form
 * export, hosted on any third-party site, submits here directly — see
 * src/lib/forms/standalone-export.ts). The actual Access-Control-* response
 * headers come from next.config.ts's `/api/forms/by-slug/:path*` rule, which
 * applies to every response from this route including this one; this handler
 * only needs to exist so the OPTIONS verb itself gets a 2xx instead of the
 * framework's default 405.
 */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

/** Public — no login required. Validates and stores one visitor's answers to a live form. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip = requestDevice(req).ip ?? "unknown";
  const { allowed, retryAfterSeconds } = rateLimit(`form-submit:${slug}:${ip}`, LIMIT, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const form = await db.form.findUnique({
    where: { slug },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!form || !form.isActive || form.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const answersInput = body && typeof body === "object" ? ((body as { answers?: Record<string, unknown> }).answers ?? {}) : {};

  const answerRows: { fieldId: string; value: string }[] = [];
  const attachmentRows: { fieldId: string; fileName: string; data: string }[] = [];
  let totalBytes = 0;
  // Resolved answer-as-string per field, built up in display order — a
  // conditional field's `conditionFieldId` only ever points at an earlier
  // field (the builder enforces that), so by the time we reach it, the
  // field it depends on has already been resolved.
  const resolvedAnswers: Record<string, string> = {};

  for (const field of form.fields) {
    if (field.type === "SECTION_HEADING" || field.type === "PAGE_BREAK") continue;

    // Hidden by conditional logic — never required, never stored, even if
    // the client sent something left over from before it was hidden.
    if (!isFieldVisible(field, resolvedAnswers)) continue;

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
      resolvedAnswers[field.id] = files.length > 0 ? "1" : "";
      continue;
    }

    if (field.type === "CHECKBOX") {
      // Constrained to the field's own defined choices — an arbitrary client-sent string
      // (one containing "|", say) would otherwise get stored and split back apart as if it
      // were several selections, since a CHECKBOX answer is itself packed pipe-separated.
      const validOptions = new Set(parseFieldOptions(field.options));
      const selected = Array.isArray(raw)
        ? raw.filter((s): s is string => typeof s === "string" && validOptions.has(s.trim())).map((s) => s.trim())
        : [];
      if (field.required && selected.length === 0) {
        return NextResponse.json({ error: `"${field.label}" is required` }, { status: 400 });
      }
      if (selected.length > 0) answerRows.push({ fieldId: field.id, value: selected.join("|") });
      resolvedAnswers[field.id] = selected.join("|");
      continue;
    }

    const value = typeof raw === "string" ? raw.trim() : "";
    if (field.required && !value) return NextResponse.json({ error: `"${field.label}" is required` }, { status: 400 });
    if (value.length > 5000) return NextResponse.json({ error: `"${field.label}" is too long` }, { status: 400 });
    if (value) {
      const problem = validateFieldValue(field, value);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      answerRows.push({ fieldId: field.id, value });
    }
    resolvedAnswers[field.id] = value;
  }

  const submission = await db.formSubmission.create({
    data: { formId: form.id, answers: { create: answerRows }, attachments: { create: attachmentRows } },
    select: { id: true },
  });

  const submitterName = detectSubmitterName(form.fields, (id) => resolvedAnswers[id]);

  // Tell whoever can see this form's submissions — its creator, plus anyone
  // in a department it was shared with — that a fresh one's waiting.
  const recipientIds = await formManagerIds(form);
  const pushBody = submitterName ? `${submitterName} just submitted a response to "${form.title}"` : `${form.title} just received a new response`;
  await Promise.all(
    Array.from(recipientIds).map((userId) =>
      notifyAndPush(
        userId,
        "form_submitted",
        { formId: form.id, formTitle: form.title, submissionId: submission.id, submitterName },
        { title: "New form submission", body: pushBody, url: `/forms/${form.id}/submissions`, tag: "form-submitted" }
      )
    )
  );

  return NextResponse.json({ id: submission.id }, { status: 201 });
}
