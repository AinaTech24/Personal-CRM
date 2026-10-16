import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "../src/lib/mysql-pool-config";

/**
 * One-off migration: UserModulePermission used to be presence-only — a row
 * existing meant full manage access to that module. It now carries four
 * independent canCreate/canRead/canUpdate/canDelete booleans, which the
 * schema push defaults to false on the new columns — so without this,
 * every grant made before this change (e.g. a Support Executive's Leave/
 * Attendance/Tasks access) would silently lose all access the moment this
 * deploy lands, despite its row still existing.
 *
 * Upgrades any row with all four flags false to all four true, preserving
 * the "presence = full access" meaning those rows were created under.
 * Idempotent: a row already carrying any explicit true/false choice (made
 * through the new Permission Manager) is left untouched, so this only ever
 * acts on a row nobody has edited since the CRUD columns were added.
 */
async function main() {
  const adapter = new PrismaMariaDb(buildPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter });

  const result = await prisma.userModulePermission.updateMany({
    where: { canCreate: false, canRead: false, canUpdate: false, canDelete: false },
    data: { canCreate: true, canRead: true, canUpdate: true, canDelete: true },
  });

  if (result.count === 0) {
    console.log("[upgrade-module-permissions-to-crud] Nothing to upgrade.");
  } else {
    console.log(`[upgrade-module-permissions-to-crud] Upgraded ${result.count} pre-CRUD grant(s) to full access.`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[upgrade-module-permissions-to-crud] Failed:", err);
  process.exit(1);
});
