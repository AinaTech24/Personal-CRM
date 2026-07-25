import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      surname: user.surname,
      mobile: user.mobile,
      avatarDataUrl: user.avatarDataUrl,
      role: user.role,
      departmentId: user.departmentId,
      department: user.department,
      timezone: user.timezone,
      locale: user.locale,
      defaultLandingPage: user.defaultLandingPage,
      density: user.density,
      hasPin: !!user.pinHash,
    },
  });
}
