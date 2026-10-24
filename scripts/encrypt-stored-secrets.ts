import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "../src/lib/mysql-pool-config";
import { encryptSecret, isEncryptedSecret } from "../src/lib/crypto";

/**
 * One-off migration: PasswordEntry.password and SmtpSettings.password used
 * to be stored as plaintext. Encrypts any row that still is — detected by
 * isEncryptedSecret, so re-running after this ships is a no-op, and a row
 * created after ENCRYPTION_KEY existed (already encrypted on write) is left
 * untouched either way.
 */
async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.log("[encrypt-stored-secrets] ENCRYPTION_KEY is not set — skipping. Set it and redeploy to encrypt existing rows.");
    return;
  }

  const adapter = new PrismaMariaDb(buildPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter });

  const entries = await prisma.passwordEntry.findMany({ select: { id: true, password: true } });
  let encryptedEntries = 0;
  for (const entry of entries) {
    if (isEncryptedSecret(entry.password)) continue;
    await prisma.passwordEntry.update({ where: { id: entry.id }, data: { password: encryptSecret(entry.password) } });
    encryptedEntries++;
  }

  const smtp = await prisma.smtpSettings.findUnique({ where: { id: "default" }, select: { password: true } });
  let encryptedSmtp = false;
  if (smtp?.password && !isEncryptedSecret(smtp.password)) {
    await prisma.smtpSettings.update({ where: { id: "default" }, data: { password: encryptSecret(smtp.password) } });
    encryptedSmtp = true;
  }

  console.log(`[encrypt-stored-secrets] Encrypted ${encryptedEntries} password entr${encryptedEntries === 1 ? "y" : "ies"}${encryptedSmtp ? " and the SMTP password" : ""}.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[encrypt-stored-secrets] Failed:", err);
  process.exit(1);
});
