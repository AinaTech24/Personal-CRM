import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, hashPassword, verifyPassword } from "@/lib/auth";
import { isValidMobile, isValidPin, normalizeMobile } from "@/lib/credentials";

const MAX_AVATAR = 1_500_000;

/** The dashboard feeds this straight into redirect(), so it must be an allowlist:
    an arbitrary string would let "/" loop forever and an absolute URL would be an
    open redirect off-site. null means "the Dashboard", the default. */
const LANDING_PAGES = ["/leads", "/tasks", "/projects", "/quotations", "/invoices"] as const;

const bodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  surname: z.string().max(120).nullable().optional(),
  mobile: z.string().max(40).nullable().optional(),
  avatarDataUrl: z
    .string()
    .max(MAX_AVATAR)
    .regex(/^data:image\//, "Must be an image data URL")
    .nullable()
    .optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
  currentPin: z.string().optional(),
  newPin: z.string().optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && d.getTime() <= Date.now();
    }, "Enter a valid date of birth")
    .nullable()
    .optional(),
  locale: z.string().max(10).optional(),
  defaultLandingPage: z.enum(LANDING_PAGES).nullable().optional(),
  density: z.enum(["comfortable", "compact"]).optional(),
});

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  // Password change requires the current password.
  let passwordHash: string | undefined;
  if (data.newPassword) {
    if (!data.currentPassword) {
      return NextResponse.json({ error: "Enter your current password to set a new one" }, { status: 400 });
    }
    const ok = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
    passwordHash = await hashPassword(data.newPassword);
  }

  // Mobile is normalized before storage (not just at login lookup) so the
  // unique constraint actually catches two people typing the same real
  // number in different formats, rather than only detecting it once someone
  // happens to type it identically to an existing row.
  let normalizedMobile: string | null | undefined;
  if (data.mobile !== undefined) {
    if (!data.mobile) {
      normalizedMobile = null;
    } else if (!isValidMobile(data.mobile)) {
      return NextResponse.json({ error: "Enter a valid 10-digit mobile number" }, { status: 400 });
    } else {
      normalizedMobile = normalizeMobile(data.mobile);
    }
  }

  // PIN change requires the current PIN — unless none is set yet, since a
  // first-time PIN has nothing to confirm against.
  let pinHash: string | undefined;
  if (data.newPin) {
    if (!isValidPin(data.newPin)) {
      return NextResponse.json({ error: "PIN must be exactly 6 digits" }, { status: 400 });
    }
    if (user.pinHash) {
      if (!data.currentPin) {
        return NextResponse.json({ error: "Enter your current PIN to set a new one" }, { status: 400 });
      }
      const ok = await verifyPassword(data.currentPin, user.pinHash);
      if (!ok) return NextResponse.json({ error: "Current PIN is incorrect" }, { status: 400 });
    }
    const willHaveMobile = normalizedMobile !== undefined ? !!normalizedMobile : !!user.mobile;
    if (!willHaveMobile) {
      return NextResponse.json({ error: "Add a mobile number before setting a PIN" }, { status: 400 });
    }
    pinHash = await hashPassword(data.newPin);
  }

  let updated;
  try {
    updated = await db.user.update({
      where: { id: user.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.surname !== undefined && { surname: data.surname || null }),
        ...(normalizedMobile !== undefined && { mobile: normalizedMobile }),
        ...(data.avatarDataUrl !== undefined && { avatarDataUrl: data.avatarDataUrl }),
        ...(data.birthday !== undefined && { birthday: data.birthday ? new Date(`${data.birthday}T00:00:00.000Z`) : null }),
        ...(data.locale !== undefined && { locale: data.locale }),
        ...(data.defaultLandingPage !== undefined && { defaultLandingPage: data.defaultLandingPage }),
        ...(data.density !== undefined && { density: data.density }),
        ...(passwordHash && { passwordHash }),
        ...(pinHash && { pinHash }),
      },
      select: {
        id: true,
        name: true,
        surname: true,
        mobile: true,
        avatarDataUrl: true,
        birthday: true,
        email: true,
        timezone: true,
        locale: true,
        defaultLandingPage: true,
        density: true,
      },
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "That mobile number is already in use" }, { status: 409 });
    }
    throw err;
  }

  // Whether a PIN exists after this request — either it was just set, or one
  // already existed before this call and wasn't touched.
  const hasPin = pinHash !== undefined || !!user.pinHash;
  return NextResponse.json({ user: { ...updated, hasPin } });
}
