import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getLeadForUser } from "@/lib/leads";

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reminderId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, reminderId } = await params;
  const access = await getLeadForUser(user, id);
  if (access === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reminder = await db.leadReminder.update({
    where: { id: reminderId, leadId: id },
    data: { completedAt: new Date() },
  });

  return NextResponse.json({ reminder });
}
