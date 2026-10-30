import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** Public — no login required. Fetches the live definition a visitor fills in at /f/[slug]. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await db.form.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      description: true,
      isActive: true,
      deletedAt: true,
      fields: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          type: true,
          label: true,
          placeholder: true,
          helpText: true,
          required: true,
          options: true,
          minLength: true,
          maxLength: true,
          minValue: true,
          maxValue: true,
          pattern: true,
          conditionFieldId: true,
          conditionOperator: true,
          conditionValue: true,
        },
      },
    },
  });
  if (!form || !form.isActive || form.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { deletedAt: _deletedAt, ...publicForm } = form;
  return NextResponse.json({ form: publicForm });
}
