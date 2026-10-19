import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "../src/lib/mysql-pool-config";

/**
 * Seeds the two "system" teams (Social Media, CRM) that src/lib/social-media.ts
 * and src/lib/crm-team.ts read/write through by slug, and copies every
 * existing CrmMember row into the generic TeamMember table under the CRM
 * team. The Social Media side of this migration is done — SocialMediaMember
 * has been dropped — so only CrmMember is still synced here. CrmMember itself
 * is left in place for this deploy (see the Teams unification plan) — only
 * read here, not dropped — so this is purely additive and safe to re-run:
 * upserts throughout, and a row already migrated (same teamId+userId) is
 * just updated in place.
 */
async function main() {
  const adapter = new PrismaMariaDb(buildPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter });

  const socialTeam = await prisma.team.upsert({
    where: { slug: "social-media" },
    create: { name: "Social Media", slug: "social-media", isSystem: true },
    update: {},
  });
  const crmTeam = await prisma.team.upsert({
    where: { slug: "crm" },
    create: { name: "CRM", slug: "crm", isSystem: true },
    update: {},
  });

  const crmMembers = await prisma.crmMember.findMany({ select: { userId: true, isLead: true } });

  let migrated = 0;
  for (const m of crmMembers) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: crmTeam.id, userId: m.userId } },
      create: { teamId: crmTeam.id, userId: m.userId, isLead: m.isLead },
      update: { isLead: m.isLead },
    });
    migrated++;
  }

  console.log(
    `[migrate-social-crm-to-teams] Social Media team ${socialTeam.id} present. CRM team ${crmTeam.id} (${crmMembers.length} member(s)). Upserted ${migrated} TeamMember row(s).`
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[migrate-social-crm-to-teams] Failed:", err);
  process.exit(1);
});
