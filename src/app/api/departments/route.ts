import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageDepartments } from "@/lib/permissions";
import { slugify } from "@/lib/slug";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const departments = await db.department.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return NextResponse.json({ departments });
}

const bodySchema = z.object({
  name: z.string().min(1),
});


export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageDepartments(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const slug = slugify(parsed.data.name);
  const existing = await db.department.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: "A department with this name already exists" }, { status: 409 });
  }

  const department = await db.department.create({ data: { name: parsed.data.name, slug } });
  return NextResponse.json({ department }, { status: 201 });
}
