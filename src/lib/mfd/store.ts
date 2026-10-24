import { db } from "@/lib/db";
import { tableDef } from "./catalog";
import { fromPrismaRow, propOf, type Rec } from "./values";

type Row = Record<string, unknown>;

/** The subset of a Prisma model delegate the generic engine uses. */
export interface Delegate {
  findFirst(args: unknown): Promise<Row | null>;
  findMany(args: unknown): Promise<Row[]>;
  count(args: unknown): Promise<number>;
  create(args: unknown): Promise<Row>;
  update(args: unknown): Promise<Row>;
  updateMany(args: unknown): Promise<{ count: number }>;
  delete(args: unknown): Promise<Row>;
}

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
export type Client = typeof db | Tx;

export function delegate(client: Client, table: string): Delegate {
  return (client as unknown as Record<string, Delegate>)[tableDef(table).delegate];
}

/** One row by id within the workspace (if the table has workspace_id), as a Rec. */
export async function getRec(client: Client, table: string, id: string, workspaceId: string): Promise<Rec | null> {
  const hasWs = tableDef(table).fields.some((f) => f.column === "workspace_id");
  const row = await delegate(client, table).findFirst({ where: { id, ...(hasWs ? { workspaceId } : {}) } });
  return row ? fromPrismaRow(table, row) : null;
}

/** Rows matching simple equality filters on spec columns, as Recs. */
export async function findRecs(client: Client, table: string, filters: Rec, opts: { take?: number } = {}): Promise<Rec[]> {
  const where: Row = {};
  for (const [k, v] of Object.entries(filters)) where[propOf(table, k)] = v;
  const rows = await delegate(client, table).findMany({ where, ...(opts.take ? { take: opts.take } : {}) });
  return rows.map((r) => fromPrismaRow(table, r));
}

export async function countRecs(client: Client, table: string, filters: Row): Promise<number> {
  const where: Row = {};
  for (const [k, v] of Object.entries(filters)) where[propOf(table, k)] = v;
  return delegate(client, table).count({ where });
}
