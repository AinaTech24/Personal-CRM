import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canViewOnboardingSubmissions } from "@/lib/onboarding";

/** Admins and the Development department only. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canViewOnboardingSubmissions(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const submission = await db.onboardingSubmission.findUnique({
    where: { id },
    include: {
      // Never select `data` here — attachments are served one at a time by
      // their own route so the detail payload stays small.
      attachments: { select: { id: true, kind: true, fileName: true, createdAt: true } },
    },
  });
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ submission });
}

const patchSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  email: z.string().trim().email().max(200).optional(),
  companyName: z.string().trim().min(1).max(200).optional(),
  aboutCompany: z.string().trim().min(1).max(5000).optional(),
  arnNo: z.string().trim().min(1).max(100).optional(),
  arnRegistration: z.string().trim().min(1).max(2000).optional(),
  euinNo: z.string().trim().min(1).max(100).optional(),
  cinNo: z.string().trim().max(100).nullable().optional(),
  panNo: z.string().trim().max(100).nullable().optional(),
  gstinNo: z.string().trim().max(100).nullable().optional(),
  grievanceFirstName: z.string().trim().max(100).nullable().optional(),
  grievanceLastName: z.string().trim().max(100).nullable().optional(),
  grievanceEmail: z.string().trim().max(200).nullable().optional(),
  grievanceContact: z.string().trim().max(40).nullable().optional(),
  existingWebsite: z.string().trim().max(500).nullable().optional(),
  loginLink: z.string().trim().max(500).nullable().optional(),
  signupLink: z.string().trim().max(500).nullable().optional(),
  ourMission: z.string().trim().max(5000).nullable().optional(),
  ourVision: z.string().trim().max(5000).nullable().optional(),
  ourPurpose: z.string().trim().max(5000).nullable().optional(),
  supportPhone: z.string().trim().min(1).max(40).optional(),
  supportEmail: z.string().trim().email().max(200).optional(),
  addressStreet: z.string().trim().max(300).nullable().optional(),
  addressLine2: z.string().trim().max(300).nullable().optional(),
  addressCity: z.string().trim().max(150).nullable().optional(),
  addressState: z.string().trim().max(150).nullable().optional(),
  addressPostalCode: z.string().trim().max(30).nullable().optional(),
  addressCountry: z.string().trim().max(100).nullable().optional(),
  hostingProvider: z.string().trim().max(150).nullable().optional(),
  hostingCredentials: z.string().trim().max(3000).nullable().optional(),
});

/** Admins and the Development department only — corrects the submitted text fields. Attachments aren't editable here (delete the submission and ask for a fresh one if a file needs replacing). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canViewOnboardingSubmissions(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.onboardingSubmission.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const submission = await db.onboardingSubmission.update({
    where: { id },
    data: {
      ...(d.fullName !== undefined && { fullName: d.fullName }),
      ...(d.phone !== undefined && { phone: d.phone }),
      ...(d.email !== undefined && { email: d.email }),
      ...(d.companyName !== undefined && { companyName: d.companyName }),
      ...(d.aboutCompany !== undefined && { aboutCompany: d.aboutCompany }),
      ...(d.arnNo !== undefined && { arnNo: d.arnNo }),
      ...(d.arnRegistration !== undefined && { arnRegistration: d.arnRegistration }),
      ...(d.euinNo !== undefined && { euinNo: d.euinNo }),
      ...(d.cinNo !== undefined && { cinNo: d.cinNo || null }),
      ...(d.panNo !== undefined && { panNo: d.panNo || null }),
      ...(d.gstinNo !== undefined && { gstinNo: d.gstinNo || null }),
      ...(d.grievanceFirstName !== undefined && { grievanceFirstName: d.grievanceFirstName || null }),
      ...(d.grievanceLastName !== undefined && { grievanceLastName: d.grievanceLastName || null }),
      ...(d.grievanceEmail !== undefined && { grievanceEmail: d.grievanceEmail || null }),
      ...(d.grievanceContact !== undefined && { grievanceContact: d.grievanceContact || null }),
      ...(d.existingWebsite !== undefined && { existingWebsite: d.existingWebsite || null }),
      ...(d.loginLink !== undefined && { loginLink: d.loginLink || null }),
      ...(d.signupLink !== undefined && { signupLink: d.signupLink || null }),
      ...(d.ourMission !== undefined && { ourMission: d.ourMission || null }),
      ...(d.ourVision !== undefined && { ourVision: d.ourVision || null }),
      ...(d.ourPurpose !== undefined && { ourPurpose: d.ourPurpose || null }),
      ...(d.supportPhone !== undefined && { supportPhone: d.supportPhone }),
      ...(d.supportEmail !== undefined && { supportEmail: d.supportEmail }),
      ...(d.addressStreet !== undefined && { addressStreet: d.addressStreet || null }),
      ...(d.addressLine2 !== undefined && { addressLine2: d.addressLine2 || null }),
      ...(d.addressCity !== undefined && { addressCity: d.addressCity || null }),
      ...(d.addressState !== undefined && { addressState: d.addressState || null }),
      ...(d.addressPostalCode !== undefined && { addressPostalCode: d.addressPostalCode || null }),
      ...(d.addressCountry !== undefined && { addressCountry: d.addressCountry || null }),
      ...(d.hostingProvider !== undefined && { hostingProvider: d.hostingProvider || null }),
      ...(d.hostingCredentials !== undefined && { hostingCredentials: d.hostingCredentials || null }),
    },
    include: { attachments: { select: { id: true, kind: true, fileName: true, createdAt: true } } },
  });

  return NextResponse.json({ submission });
}

/** Admins and the Development department only. Cascades to the submission's attachments. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !canViewOnboardingSubmissions(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await db.onboardingSubmission.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.onboardingSubmission.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
