import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "../src/lib/mysql-pool-config";

/**
 * One-off cleanup for a bug in the retired scripts/migrate-onboarding-to-forms.ts:
 * it looked up its form by a fixed slug ("website-onboarding-form"), but
 * scripts/hash-form-slugs.ts — which ran right after it, every single
 * deploy — immediately rehashed that slug away. The next deploy's migrate
 * script could then never find the form it had already created, so it made
 * another one, every single deploy, for as long as both scripts shared the
 * build chain.
 *
 * Collapses every "Website Onboarding Form" with zero submissions down to
 * the one with the most fields (the original, hand-extended by someone in
 * the builder, per that script's own comment) — safe because a form with
 * submissions is never a deletion candidate, so real client data can't be
 * touched by this. Idempotent: once at most one remains, there's nothing
 * left to do.
 */
async function main() {
  const adapter = new PrismaMariaDb(buildPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter });

  const forms = await prisma.form.findMany({
    where: { title: "Website Onboarding Form" },
    include: { _count: { select: { fields: true, submissions: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (forms.length <= 1) {
    console.log("[dedupe-onboarding-forms] Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  const withNoSubmissions = forms.filter((f) => f._count.submissions === 0);
  if (withNoSubmissions.length <= 1) {
    console.log("[dedupe-onboarding-forms] At most one duplicate has zero submissions — nothing safe to delete.");
    await prisma.$disconnect();
    return;
  }

  const keeper = withNoSubmissions.reduce((best, f) => (f._count.fields > best._count.fields ? f : best));
  const toDelete = withNoSubmissions.filter((f) => f.id !== keeper.id);

  for (const f of toDelete) {
    await prisma.form.delete({ where: { id: f.id } });
    console.log(`[dedupe-onboarding-forms] Deleted duplicate (id: ${f.id}, ${f._count.fields} field(s), slug: ${f.slug})`);
  }

  console.log(
    `[dedupe-onboarding-forms] Kept id ${keeper.id} (${keeper._count.fields} field(s), slug: ${keeper.slug}). Deleted ${toDelete.length} duplicate(s).`
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[dedupe-onboarding-forms] Failed:", err);
  process.exit(1);
});
