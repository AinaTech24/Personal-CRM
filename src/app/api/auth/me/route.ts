import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { getSocialMembership, hasSocialMediaAccess, isSocialMediaLead, isSocialMediaOnlyUser } from "@/lib/social-media";
import { getCrmMembership, hasCrmAccess, isCrmLead } from "@/lib/crm-team";
import { hasAnyFormAccess } from "@/lib/forms";
import { hasCommandCentreAccess } from "@/lib/mfd/actor";
import { getUserModulePermissions, getVisibleToggleableModules } from "@/lib/module-permissions-store";
import { GRANTED_LANDING_PAGE_MODULES, TOGGLEABLE_MODULES } from "@/lib/modules";

const TOGGLE_LABEL: Record<string, string> = Object.fromEntries(TOGGLEABLE_MODULES.map((m) => [m.key, m.label]));

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });

  // Same access checks (dashboard)/layout.tsx runs to decide what the
  // sidebar shows — re-run here so the "Default landing page" picker in
  // Settings only ever offers a page this person can actually reach. See
  // GRANTED_LANDING_PAGE_MODULES (modules.ts) for why these six aren't part
  // of getVisibleToggleableModules's own default-on-unless-hidden list.
  const [membership, modulePermissions, crmMembership, canViewForms, hasCommandCentre, visibleToggleable] =
    await Promise.all([
      getSocialMembership(user.id),
      getUserModulePermissions(user.id),
      getCrmMembership(user.id),
      isAdmin(user) ? Promise.resolve(false) : hasAnyFormAccess(user),
      hasCommandCentreAccess(user.id, user.role).catch(() => false),
      getVisibleToggleableModules(user),
    ]);
  const restrictToSocialMedia = isSocialMediaOnlyUser(user, membership);
  const crmAccess = !isAdmin(user) && hasCrmAccess(user, crmMembership);
  const managedModuleSet = new Set(modulePermissions);
  const hasClientsAccess =
    isAdmin(user) || restrictToSocialMedia || crmAccess || managedModuleSet.has("CLIENTS");
  const grantedExtras = GRANTED_LANDING_PAGE_MODULES.filter((m) => {
    switch (m.href) {
      case "/clients":
        return hasClientsAccess;
      case "/calls":
        return isAdmin(user) || crmAccess || managedModuleSet.has("CALLS");
      case "/forms":
        return isAdmin(user) || canViewForms;
      case "/crm/team":
        return crmAccess && isCrmLead(user, crmMembership);
      case "/social-media/team":
        return restrictToSocialMedia && isSocialMediaLead(user, membership);
      case "/consulting":
        return hasCommandCentre;
      default:
        return false;
    }
  });
  // "" (Dashboard) is always first and always on offer — it's the default.
  const landingPageOptions = [
    { value: "", label: "Dashboard" },
    ...visibleToggleable
      .filter((key) => !(restrictToSocialMedia && key === "quotations")) // SOCIAL_MEDIA_EXCLUDED_HREFS, sidebar.tsx
      .map((key) => ({ value: `/${key}`, label: TOGGLE_LABEL[key] ?? key })),
    ...grantedExtras.map((m) => ({ value: m.href, label: m.label })),
  ];

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      surname: user.surname,
      mobile: user.mobile,
      avatarDataUrl: user.avatarDataUrl,
      status: user.status,
      birthday: user.birthday,
      designation: user.designation,
      dateOfJoining: user.dateOfJoining,
      role: user.role,
      departmentId: user.departmentId,
      department: user.department,
      timezone: user.timezone,
      locale: user.locale,
      defaultLandingPage: user.defaultLandingPage,
      landingPageOptions,
      density: user.density,
      hasPin: !!user.pinHash,
      totpEnabled: user.totpEnabled,
      notifyOnNewSignIn: user.notifyOnNewSignIn,
      quietHoursStart: user.quietHoursStart,
      quietHoursEnd: user.quietHoursEnd,
      isDepartmentAdmin: user.isDepartmentAdmin,
      modulePermissions,
      socialMedia: {
        hasAccess: hasSocialMediaAccess(user, membership),
        isLead: isSocialMediaLead(user, membership),
      },
    },
  });
}
