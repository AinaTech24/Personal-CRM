import "dotenv/config";
import { spawnSync } from "child_process";

/**
 * Wraps `prisma migrate deploy` with a one-time, automatic baseline for a
 * database that has never had Prisma migration history (this VPS's database
 * was managed by `prisma db push` until now, so it has every table but no
 * `_prisma_migrations` bookkeeping). Prisma refuses to run migrations
 * against a database it doesn't recognize (error P3005) rather than guess —
 * so on first run here, we tell it "the schema in 0_init already matches
 * what's live" via `prisma migrate resolve --applied 0_init`. That command
 * only writes a bookkeeping row; it runs no SQL against any table or row.
 *
 * After that one-time resolve, `_prisma_migrations` exists and every future
 * deploy here (and everywhere else `npm run build` runs) goes straight
 * through `migrate deploy` with no retry needed.
 */

function run(args: string[]) {
  return spawnSync("npx", ["prisma", ...args], { stdio: "inherit", shell: process.platform === "win32" });
}

const first = run(["migrate", "deploy"]);
if (first.status === 0) process.exit(0);

console.log(
  "[migrate-deploy-safe] `migrate deploy` didn't succeed — if this database has no migration history yet, baseline it now and retry once."
);

const resolve = run(["migrate", "resolve", "--applied", "0_init"]);
if (resolve.status !== 0) {
  console.error(
    "[migrate-deploy-safe] Baseline resolve also failed. This isn't the missing-history case — it's a real migration problem. Stopping without retrying."
  );
  process.exit(first.status ?? 1);
}

console.log("[migrate-deploy-safe] Baseline recorded. Retrying `migrate deploy`...");
const second = run(["migrate", "deploy"]);
process.exit(second.status ?? 1);
