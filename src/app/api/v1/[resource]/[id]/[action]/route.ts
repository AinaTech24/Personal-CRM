import { NextRequest, NextResponse } from "next/server";
import type { Actor } from "@/lib/mfd/access";
import {
  answerQuestion,
  approveAssessment,
  calculateScorecard,
  convertLead,
  correctKpi,
  issueAssessment,
  newSchemeVersion,
  newTemplateVersion,
  publishScheme,
  publishTemplate,
  reopenAssessment,
  respondentLink,
  startAssessmentReview,
  submitAssessment,
  uploadDocumentFile,
  uploadMediaFile,
} from "@/lib/mfd/actions";
import { HttpError, setArchived } from "@/lib/mfd/engine";
import { MAX_FILE_BYTES } from "@/lib/mfd/storage";
import { jsonBody, tableOf, withActor } from "@/lib/mfd/http";

type Body = Record<string, unknown>;
type Handler = (actor: Actor, id: string, req: NextRequest, table: string) => Promise<unknown>;

const json = (fn: (actor: Actor, id: string, body: Body) => Promise<unknown>): Handler => async (actor, id, req) => fn(actor, id, await jsonBody(req));

async function fileFrom(req: NextRequest) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_FILE_BYTES + 64 * 1024) throw new HttpError(413, `Files can be up to ${MAX_FILE_BYTES / 1048576}MB.`);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw new HttpError(400, "Attach the file as multipart field \"file\".");
  if (file.size > MAX_FILE_BYTES) throw new HttpError(413, `Files can be up to ${MAX_FILE_BYTES / 1048576}MB.`);
  const note = form?.get("change_note");
  return { file: { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, note: typeof note === "string" && note.trim() ? note.trim() : null };
}

/** POST /api/v1/{resource}/{id}/{action} — explicit workflow transitions (GV-09). */
const ACTIONS: Record<string, Record<string, Handler>> = {
  "*": {
    archive: (a, id, req, table) => archive(a, id, req, table, true),
    unarchive: (a, id, req, table) => archive(a, id, req, table, false),
  },
  leads: { convert: json(convertLead) },
  assessment_templates: {
    publish: json(publishTemplate),
    "new-version": (a, id) => newTemplateVersion(a, id),
  },
  scoring_schemes: {
    publish: (a, id) => publishScheme(a, id),
    "new-version": (a, id) => newSchemeVersion(a, id),
  },
  assessments: {
    issue: json(issueAssessment),
    answer: json(answerQuestion),
    submit: json(submitAssessment),
    "start-review": json(startAssessmentReview),
    approve: json(approveAssessment),
    reopen: json(reopenAssessment),
    "respondent-link": async (a, id, req) => respondentLink(a, id, await jsonBody(req).catch(() => ({})), req.nextUrl.origin),
  },
  maturity_scorecards: { calculate: (a, id) => calculateScorecard(a, id) },
  kpi_observations: { correct: json(correctKpi) },
  document_records: {
    upload: async (a, id, req) => {
      const { file, note } = await fileFrom(req);
      return uploadDocumentFile(a, id, file, note);
    },
  },
  media_records: {
    upload: async (a, id, req) => {
      const { file } = await fileFrom(req);
      return uploadMediaFile(a, id, file);
    },
  },
};

async function archive(actor: Actor, id: string, req: NextRequest, table: string, on: boolean) {
  const body = await jsonBody(req).catch(() => ({}) as Body);
  return setArchived(actor, table, id, on, typeof body.row_version === "number" ? body.row_version : undefined);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ resource: string; id: string; action: string }> }) {
  return withActor(async (actor) => {
    const { resource, id, action } = await params;
    const table = tableOf(resource);
    const handler = ACTIONS[table]?.[action] ?? ACTIONS["*"][action];
    if (!handler) throw new HttpError(404, `Unknown action "${action}".`);
    return NextResponse.json(await handler(actor, id, req, table));
  });
}
