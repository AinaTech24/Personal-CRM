import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "../src/lib/mysql-pool-config";

/**
 * One-off migration: forms used to get a public link derived from their
 * title (slugify("Appointment Form") -> "appointment-form"), which meant
 * anyone could guess another form's link just by trying its likely name.
 * New forms already get a random 12-hex-char slug (see uniqueFormSlug in
 * src/lib/forms.ts) — this re-hashes any existing form whose slug isn't
 * already in that shape.
 *
 * Idempotent and safe to leave in the build chain: a form whose slug is
 * already a 12-hex-char hash is left untouched, so re-running this only
 * ever acts on a form that still has an old, readable slug.
 *
 * Changes a form's public URL — anyone who already has the old link will
 * need the new one. There's no way around that and still remove the
 * guessability the old slug had.
 */

const HEX_SLUG = /^[0-9a-f]{12}$/;

async function uniqueHash(prisma: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomBytes(6).toString("hex");
    const existing = await prisma.form.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Couldn't generate a unique form link");
}

async function main() {
  const adapter = new PrismaMariaDb(buildPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter });

  const forms = await prisma.form.findMany({ select: { id: true, title: true, slug: true } });
  const toRehash = forms.filter((f) => !HEX_SLUG.test(f.slug));

  if (toRehash.length === 0) {
    console.log("[hash-form-slugs] Every form link is already a hash — nothing to do.");
    await prisma.$disconnect();
    return;
  }

  for (const f of toRehash) {
    const newSlug = await uniqueHash(prisma);
    await prisma.form.update({ where: { id: f.id }, data: { slug: newSlug } });
    console.log(`[hash-form-slugs] "${f.title}": /f/${f.slug} -> /f/${newSlug}`);
  }

  console.log(`[hash-form-slugs] Done — rehashed ${toRehash.length} form(s).`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[hash-form-slugs] Failed:", err);
  process.exit(1);
});
