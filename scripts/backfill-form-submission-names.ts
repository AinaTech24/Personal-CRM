import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "../src/lib/mysql-pool-config";
import { detectSubmitterName } from "../src/lib/form-fields";

/**
 * One-off migration: form_submitted notifications used to store only
 * {formId, submissionId} — the bell/toast/notifications page always showed
 * the generic "A form you manage just received a new response" because
 * there was nothing to name the submitter with. New submissions now also
 * store {formTitle, submitterName} (see src/app/api/forms/by-slug/[slug]/
 * submit/route.ts), so this backfills the same two fields onto every
 * existing form_submitted notification by re-deriving them from the
 * submission's own stored answers, via the same detectSubmitterName() the
 * live route uses.
 *
 * Idempotent and safe to leave in the build chain: only a notification
 * whose payload doesn't already have a formTitle key is touched, so
 * re-running this only ever acts on one that's never been backfilled.
 */

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
  let failed = 0;

  const bySubmissionId = new Map<string, (typeof toBackfill)[number][]>();
  for (const n of toBackfill) {
    const payload = n.payload as Record<string, unknown>;
    const submissionId = typeof payload.submissionId === "string" ? payload.submissionId : null;
    if (!submissionId) {
      skipped++;
      continue;
    }
    const group = bySubmissionId.get(submissionId);
    if (group) group.push(n);
    else bySubmissionId.set(submissionId, [n]);
  }

  const submissions = await prisma.formSubmission.findMany({
    where: { id: { in: [...bySubmissionId.keys()] } },
    select: {
      id: true,
      form: { select: { title: true, fields: { orderBy: { order: "asc" }, select: { id: true, type: true, label: true } } } },
      answers: { select: { fieldId: true, value: true } },
    },
  });
  const submissionById = new Map(submissions.map((s) => [s.id, s]));

  for (const [submissionId, group] of bySubmissionId) {
    const submission = submissionById.get(submissionId);
    if (!submission) {
      // The form or submission was deleted/purged since — nothing left to name it with.
      skipped += group.length;
      continue;
    }

    const answerByField = new Map(submission.answers.map((a) => [a.fieldId, a.value]));
    const submitterName = detectSubmitterName(submission.form.fields, (id) => answerByField.get(id));

    for (const n of group) {
      const payload = n.payload as Record<string, unknown>;
      try {
        await prisma.notification.update({
          where: { id: n.id },
          data: { payload: { ...payload, formTitle: submission.form.title, submitterName } },
        });
        updated++;
      } catch (err) {
        // One bad row shouldn't fail the whole build — this is a nice-to-have
        // backfill, not a migration the app depends on to function.
        console.error(`[backfill-form-submission-names] Failed to update notification ${n.id}:`, err);
        failed++;
      }
    }
  }

  console.log(
    `[backfill-form-submission-names] Done — updated ${updated}, skipped ${skipped} (deleted form/submission), failed ${failed}.`
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  // A per-row update failure is caught inside the loop and never reaches here —
  // this only fires for something structural (e.g. the DB connection itself),
  // which is worth still failing the build over.
  console.error("[backfill-form-submission-names] Failed:", err);
  process.exit(1);
});
