import { z } from "zod";
import type { Client, ClientTeamMember, User } from "@/generated/prisma/client";
import { dateFromKey, keyFromDate } from "@/lib/attendance";

export const CLIENT_CATEGORIES = ["CRM", "WEBSITE", "WHATSAPP", "SMM", "DDQ"] as const;

export const clientInclude = {
  team: {
    include: { user: { select: { id: true, name: true, surname: true, avatarDataUrl: true } } },
    orderBy: { role: "asc" },
  },
} as const;

type WithTeam = Client & {
  team: (ClientTeamMember & { user: Pick<User, "id" | "name" | "surname" | "avatarDataUrl"> })[];
};

const fullName = (u: { name: string; surname: string | null }) => [u.name, u.surname].filter(Boolean).join(" ");
const key = (d: Date | null) => (d ? keyFromDate(d) : null);

/** Dates go out as "YYYY-MM-DD" keys so a timezone can never shift one by a day. */
export function serializeClient(c: WithTeam) {
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    reason: c.reason,
    ownerName: c.ownerName,
    mobile: c.mobile,
    email: c.email,
    ownerBirthday: key(c.ownerBirthday),
    productStart: key(c.productStart),
    productEnd: key(c.productEnd),
    createdAt: c.createdAt.toISOString(),
    team: c.team.map((m) => ({
      userId: m.user.id,
      name: fullName(m.user),
      avatarDataUrl: m.user.avatarDataUrl,
      role: m.role,
    })),
  };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(dateFromKey(v).getTime()) && keyFromDate(dateFromKey(v)) === v)
  .optional()
  .nullable()
  .transform((v) => v || null);

export const clientBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category: z.enum(CLIENT_CATEGORIES),
    reason: optionalText(2000),
    ownerName: z.string().trim().min(1).max(200),
    mobile: optionalText(30),
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => v === null || z.email().safeParse(v).success, "Invalid email"),
    ownerBirthday: optionalDate,
    productStart: optionalDate,
    productEnd: optionalDate,
    team: z
      .array(z.object({ userId: z.string().min(1), role: z.string().trim().min(1).max(100) }))
      .max(50)
      .default([]),
  })
  .refine((v) => !v.productStart || !v.productEnd || v.productEnd >= v.productStart, {
    message: "Product end can't be before its start",
    path: ["productEnd"],
  });

export type ClientBody = z.infer<typeof clientBodySchema>;

/** Prisma data for the scalar fields of a client body. */
export function clientData(b: ClientBody) {
  return {
    name: b.name,
    category: b.category,
    reason: b.reason,
    ownerName: b.ownerName,
    mobile: b.mobile,
    email: b.email,
    ownerBirthday: b.ownerBirthday ? dateFromKey(b.ownerBirthday) : null,
    productStart: b.productStart ? dateFromKey(b.productStart) : null,
    productEnd: b.productEnd ? dateFromKey(b.productEnd) : null,
  };
}

/** One row per person: a repeated user keeps its last role rather than violating the unique key. */
export function dedupeTeam(team: ClientBody["team"]) {
  return [...new Map(team.map((m) => [m.userId, m])).values()];
}
