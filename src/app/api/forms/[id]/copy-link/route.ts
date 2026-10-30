import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canManageForms, uniqueFormSlug } from "@/lib/forms";

/**
 * The link to copy for a form — rotating it to a fresh slug first, unless
 * the form has `lockSlug` set. The old link stops working the moment this
 * rotates it, which is the point: a copied link that's about to be shared
 * somewhere new shouldn't still work from wherever it was last pasted.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !(await canManageForms(user, "UPDATE"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const form = await db.form.findUnique({ where: { id }, select: { id: true, slug: true, lockSlug: true, deletedAt: true } });
  if (!form || form.deletedAt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (form.lockSlug) {
    return NextResponse.json({ slug: form.slug });
  }

  const slug = await uniqueFormSlug();
  await db.form.update({ where: { id }, data: { slug } });
  return NextResponse.json({ slug });
}
