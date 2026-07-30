import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSocialMembership, hasSocialMediaAccess, isSocialMediaLead } from "@/lib/social-media";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  const membership = await getSocialMembership(user.id);

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
      socialMedia: {
        hasAccess: hasSocialMediaAccess(user, membership),
        isLead: isSocialMediaLead(user, membership),
      },
    },
  });
}
