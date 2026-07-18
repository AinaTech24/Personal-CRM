import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

/** Admin: how many attendance records are awaiting attention (checked in / pending approval). Drives the sidebar dot. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ count: 0 }, { status: 403 });

  const count = await db.attendance.count({ where: { approvalStatus: "PENDING" } });
  return NextResponse.json({ count });
}
