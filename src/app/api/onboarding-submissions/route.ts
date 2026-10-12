import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  canViewOnboardingSubmissions,
  MAX_FILES_PER_FIELD,
  MAX_TOTAL_ATTACHMENT_BYTES,
  OnboardingUploadError,
  parseAttachmentDataUrl,
  sanitizeAttachmentFileName,
} from "@/lib/onboarding";
import type { OnboardingAttachmentKind } from "@/generated/prisma/enums";

/** Admins and the Development department only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canViewOnboardingSubmissions(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const submissions = await db.onboardingSubmission.findMany({
    select: {
      id: true,
      fullName: true,
      companyName: true,
      email: true,
      phone: true,
      arnNo: true,
      createdAt: true,
      _count: { select: { attachments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ submissions });
}

const fileSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  dataUrl: z.string().min(1),
});

const bodySchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(200),
  companyName: z.string().trim().min(1).max(200),
  aboutCompany: z.string().trim().min(1).max(5000),

  arnNo: z.string().trim().min(1).max(100),
  arnRegistration: z.string().trim().min(1).max(2000),
  euinNo: z.string().trim().min(1).max(100),
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

  supportPhone: z.string().trim().min(1).max(40),
  supportEmail: z.string().trim().email().max(200),

  addressStreet: z.string().trim().max(300).nullable().optional(),
  addressLine2: z.string().trim().max(300).nullable().optional(),
  addressCity: z.string().trim().max(150).nullable().optional(),
  addressState: z.string().trim().max(150).nullable().optional(),
  addressPostalCode: z.string().trim().max(30).nullable().optional(),
  addressCountry: z.string().trim().max(100).nullable().optional(),

  hostingProvider: z.string().trim().max(150).nullable().optional(),
  hostingCredentials: z.string().trim().max(3000).nullable().optional(),

  logo: fileSchema.nullable().optional(),
  founderDirectorImages: z.array(fileSchema).max(MAX_FILES_PER_FIELD).optional(),
  teamImages: z.array(fileSchema).max(MAX_FILES_PER_FIELD).optional(),
  awardsTestimonials: z.array(fileSchema).max(MAX_FILES_PER_FIELD).optional(),
});

/** Public — no login required. Anyone with the form link can submit it. */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const d = parsed.data;

  const groups: { kind: OnboardingAttachmentKind; files: { fileName: string; dataUrl: string }[] }[] = [
    { kind: "LOGO", files: d.logo ? [d.logo] : [] },
    { kind: "FOUNDER_DIRECTOR", files: d.founderDirectorImages ?? [] },
    { kind: "TEAM", files: d.teamImages ?? [] },
    { kind: "AWARDS_TESTIMONIALS", files: d.awardsTestimonials ?? [] },
  ];

  const attachments: { kind: OnboardingAttachmentKind; fileName: string; data: string }[] = [];
  let totalBytes = 0;
  try {
    for (const group of groups) {
      for (const file of group.files) {
        const { base64, bytes } = parseAttachmentDataUrl(file.dataUrl, file.fileName);
        totalBytes += bytes;
        if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
          throw new OnboardingUploadError(`Attachments exceed the ${MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024)}MB total limit`);
        }
        attachments.push({ kind: group.kind, fileName: sanitizeAttachmentFileName(file.fileName), data: base64 });
      }
    }
  } catch (err) {
    if (err instanceof OnboardingUploadError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }

  const submission = await db.onboardingSubmission.create({
    data: {
      fullName: d.fullName,
      phone: d.phone,
      email: d.email,
      companyName: d.companyName,
      aboutCompany: d.aboutCompany,
      arnNo: d.arnNo,
      arnRegistration: d.arnRegistration,
      euinNo: d.euinNo,
      cinNo: d.cinNo || null,
      panNo: d.panNo || null,
      gstinNo: d.gstinNo || null,
      grievanceFirstName: d.grievanceFirstName || null,
      grievanceLastName: d.grievanceLastName || null,
      grievanceEmail: d.grievanceEmail || null,
      grievanceContact: d.grievanceContact || null,
      existingWebsite: d.existingWebsite || null,
      loginLink: d.loginLink || null,
      signupLink: d.signupLink || null,
      ourMission: d.ourMission || null,
      ourVision: d.ourVision || null,
      ourPurpose: d.ourPurpose || null,
      supportPhone: d.supportPhone,
      supportEmail: d.supportEmail,
      addressStreet: d.addressStreet || null,
      addressLine2: d.addressLine2 || null,
      addressCity: d.addressCity || null,
      addressState: d.addressState || null,
      addressPostalCode: d.addressPostalCode || null,
      addressCountry: d.addressCountry || "India",
      hostingProvider: d.hostingProvider || null,
      hostingCredentials: d.hostingCredentials || null,
      attachments: { create: attachments },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: submission.id }, { status: 201 });
}
