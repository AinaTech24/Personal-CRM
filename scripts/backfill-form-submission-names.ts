import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "../src/lib/mysql-pool-config";

/**
 * One-off migration: form_submitted notifications used to store only
 * {formId, submissionId} — the bell/toast/notifications page always showed
 * the generic "A form you manage just received a new response" because
 * there was nothing to name the submitter with. New submissions now also
 * store {formTitle, submitterName} (see src/app/api/forms/by-slug/[slug]/
 * submit/route.ts), so this backfills the same two fields onto every
 * existing form_submitted notification by re-deriving them from the
 * submission's own stored answers — same "first field whose label reads as
 * a name, else the first short-text/email/phone answer" logic the live
 * route uses.
 *
 * Idempotent and safe to leave in the build chain: only a notification
 * whose payload doesn't already have a formTitle key is touched, so
 * re-running this only ever acts on one that's never been backfilled.
 */

const NAME_FIELD_TYPES = new Set(["SHORT_TEXT", "EMAIL", "PHONE"]);

async function main() {
  const adapter = new PrismaMariaDb(buildPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter });

  const notifications = await prisma.notification.findMany({
    where: { type: "form_submitted" },
    select: { id: true, payload: true },
  });
  const toBackfill = notifications.filter((n) => {
    const payload = n.payload as Record<string, unknown> | null;
    return payload && typeof payload === "object" && payload.formTitle === undefined;
  });

  if (toBackfill.length === 0) {
    console.log("[backfill-form-submission-names] Every form_submitted notification already has a name — nothing to do.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const n of toBackfill) {
    const payload = n.payload as Record<string, unknown>;
    const submissionId = typeof payload.submissionId === "string" ? payload.submissionId : null;
    if (!submissionId) {
      skipped++;
      continue;
    }

    const submission = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
      select: {
        form: { select: { title: true, fields: { orderBy: { order: "asc" }, select: { id: true, type: true, label: true } } } },
        answers: { select: { fieldId: true, value: true } },
      },
    });
    if (!submission) {
      // The form or submission was deleted/purged since — nothing left to name it with.
      skipped++;
      continue;
    }

    const answerByField = new Map(submission.answers.map((a) => [a.fieldId, a.value]));
    const nameField =
      submission.form.fields.find((f) => NAME_FIELD_TYPES.has(f.type) && /name/i.test(f.label) && answerByField.get(f.id)) ??
      submission.form.fields.find((f) => NAME_FIELD_TYPES.has(f.type) && answerByField.get(f.id));
    const submitterName = nameField ? (answerByField.get(nameField.id) ?? null) : null;

    await prisma.notification.update({
      where: { id: n.id },
      data: { payload: { ...payload, formTitle: submission.form.title, submitterName } },
    });
    updated++;
  }

  console.log(`[backfill-form-submission-names] Done — updated ${updated}, skipped ${skipped} (deleted form/submission).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[backfill-form-submission-names] Failed:", err);
  process.exit(1);
});
