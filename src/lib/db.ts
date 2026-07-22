import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "@/lib/mysql-pool-config";
import {
  AUDIT_IGNORED_MODELS,
  currentActor,
  describeRecord,
  humanModel,
  summariseChanges,
} from "@/lib/audit";

declare global {
  var __prisma: ReturnType<typeof createClient> | undefined;
}

/** Writes we record. Reads and counts are ignored. */
const LOGGED_ACTIONS: Record<string, "create" | "update" | "delete"> = {
  create: "create",
  createMany: "create",
  update: "update",
  updateMany: "update",
  upsert: "update",
  delete: "delete",
  deleteMany: "delete",
};

function createClient() {
  const adapter = new PrismaMariaDb(buildPoolConfig(process.env.DATABASE_URL!));
  const base = new PrismaClient({ adapter });

  /**
   * Records every write, centrally.
   *
   * Done here rather than in each route so a new endpoint is covered the day
   * it's written. The trade-off is that entries describe the change rather than
   * the intent — "Lead updated", not "Lead reassigned" — which is the right way
   * round: a generic entry that always exists beats a precise one that someone
   * forgot to add.
   *
   * Logging never fails the operation it describes. An audit trail that can
   * break a save is worse than a gap in the trail.
   */
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);

          const action = LOGGED_ACTIONS[operation];
          if (!action || !model || AUDIT_IGNORED_MODELS.has(model)) return result;

          void (async () => {
            try {
              const actor = currentActor();
              const input = (args as { data?: unknown; create?: unknown }).data ??
                (args as { create?: unknown }).create;

              // `create` returns the row, so prefer its id and label; bulk
              // operations only report a count.
              const row = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
              const recordId = typeof row?.id === "string" ? row.id : null;
              const label = describeRecord(row) ?? describeRecord(input);
              const noun = humanModel(model);
              const verb = action === "create" ? "created" : action === "delete" ? "deleted" : "updated";

              await base.auditLog.create({
                data: {
                  model,
                  action,
                  recordId,
                  summary: label ? `${noun} "${label}" ${verb}` : `${noun} ${verb}`,
                  // Cast: the helper returns a plain object, which is a valid
                  // JSON value but not typed as Prisma's input union.
                  changes:
                    action === "delete"
                      ? undefined
                      : ((summariseChanges(input) ?? undefined) as Prisma.InputJsonValue | undefined),
                  actorId: actor?.id ?? null,
                  actorName: actor?.name ?? null,
                },
              });
            } catch {
              // Deliberately silent: a failed log must not surface as a failed save.
            }
          })();

          return result;
        },
      },
    },
  });
}

export const db = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
