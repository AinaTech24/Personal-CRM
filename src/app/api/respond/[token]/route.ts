import { NextRequest, NextResponse } from "next/server";
import { answerQuestion, submitAssessment } from "@/lib/mfd/actions";
import { HttpError } from "@/lib/mfd/engine";
import { errorResponse } from "@/lib/mfd/http";
import { resolveRespondent } from "@/lib/mfd/respondent";
import { rateLimit } from "@/lib/rate-limit";
import { requestDevice } from "@/lib/request-info";

/**
 * The client respondent's only way in (AUT-07): answer one question or
 * submit, for the single assessment the link is bound to. No session, no
 * other records; every call re-validates the link.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { ip } = requestDevice(req);
    const limit = rateLimit(`respond:${token.slice(0, 40)}:${ip ?? "?"}`, 240, 10 * 60_000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many requests — wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    }
    const session = await resolveRespondent(token);
    if (!session) throw new HttpError(404, "This link has expired or is no longer valid. Ask your Aina consultant for a new one.");
    if (!session.open) throw new HttpError(409, "This assessment has already been submitted.");

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") throw new HttpError(400, "Expected a JSON object body.");
    const actor = await session.actor();
    const via = { contactId: session.contactId };
    const id = session.asm.id as string;

    if (body.op === "submit") {
      const saved = await submitAssessment(actor, id, {}, via);
      return NextResponse.json({ status: saved.status, completion_pct: saved.completion_pct });
    }
    if (body.op === "answer") {
      const { assessment } = await answerQuestion(actor, id, { question_id: body.question_id, value: body.value, skip_reason: body.skip_reason, reason: body.reason }, via);
      return NextResponse.json({ status: assessment.status, completion_pct: assessment.completion_pct });
    }
    throw new HttpError(400, "Unknown operation.");
  } catch (e) {
    return errorResponse(e);
  }
}
