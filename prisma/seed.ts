import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "../src/lib/mysql-pool-config";
import { slugify } from "../src/lib/slug";

async function main() {
  const adapter = new PrismaMariaDb(buildPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter });

  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Super Admin";

  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env");
  }
  if (!email.toLowerCase().endsWith("@ainatech.in")) {
    throw new Error("SEED_ADMIN_EMAIL must be an @ainatech.in address");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: "SUPER_ADMIN",
        isActive: true,
      },
    });
    console.log(`Created super admin: ${user.email} (id: ${user.id})`);
  } else {
    console.log(`Super admin already exists: ${email}`);
  }

  // Idempotent — safe to run against a database that already has these
  // departments (from a previous seed run, or created by hand): matched by
  // slug, only the flag this seed cares about is ever touched, nothing else
  // about an existing department is overwritten.
  await upsertDepartmentFlag(prisma, "Analyst", "isAnalystDept");
  await upsertDepartmentFlag(prisma, "Development", "hasClientsModule");

  await prisma.$disconnect();
}

async function upsertDepartmentFlag(
  prisma: PrismaClient,
  name: string,
  flag: "isAnalystDept" | "hasClientsModule"
) {
  const slug = slugify(name);
  const existing = await prisma.department.findUnique({ where: { slug } });
  if (existing) {
    if (!existing[flag]) {
      await prisma.department.update({ where: { id: existing.id }, data: { [flag]: true } });
      console.log(`Enabled ${flag} on existing department: ${existing.name}`);
    } else {
      console.log(`Department already has ${flag}: ${existing.name}`);
    }
    return;
  }
  const department = await prisma.department.create({ data: { name, slug, [flag]: true } });
  console.log(`Created department: ${department.name} (${flag}=true)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
