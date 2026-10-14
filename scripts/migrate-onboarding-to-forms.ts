import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { buildPoolConfig } from "../src/lib/mysql-pool-config";

/**
 * One-off migration: makes sure a "Website Onboarding Form" Form exists
 * (creating it with the original ~30 fields if nothing's there yet — but
 * leaving an already-existing one's fields alone, since by the time this
 * first ran someone had already rebuilt it by hand in the new builder), and
 * carries over every existing OnboardingSubmission + its attachments as
 * FormSubmission/FormAnswer/FormAttachment rows on THAT form — nothing
 * submitted by a real client is lost when the old hard-coded module goes
 * away, regardless of who defined the form's fields.
 *
 * Safe to run more than once: skips field creation once the form has any
 * fields, and skips submission migration once the form has any submissions,
 * so it stays harmless left in the build chain. A field label from an old
 * submission that has no matching field on the live form is logged and
 * skipped rather than aborting the whole run.
 *
 * Deliberately does NOT touch the old OnboardingSubmission/OnboardingAttachment
 * tables beyond reading them — dropping those happens in a separate follow-up
 * once the migrated data has been confirmed live.
 */

const SLUG = "website-onboarding-form";

type FieldSpec = {
  label: string;
  type:
    | "SHORT_TEXT"
    | "LONG_TEXT"
    | "EMAIL"
    | "PHONE"
    | "NUMBER"
    | "DATE"
    | "DROPDOWN"
    | "RADIO"
    | "CHECKBOX"
    | "FILE_SINGLE"
    | "FILE_MULTI"
    | "SECTION_HEADING";
  required?: boolean;
  placeholder?: string;
  options?: string;
};

const FIELDS: FieldSpec[] = [
  { label: "Full Name", type: "SHORT_TEXT", required: true },
  { label: "Phone", type: "PHONE", required: true },
  { label: "Email", type: "EMAIL", required: true },
  { label: "Company Name", type: "SHORT_TEXT", required: true },
  { label: "About Your Company", type: "LONG_TEXT", required: true },
  { label: "Company Logo", type: "FILE_SINGLE" },
  { label: "ARN No", type: "SHORT_TEXT", required: true },
  { label: "ARN Registration and Expiry Dates", type: "LONG_TEXT", required: true },
  { label: "EUIN No", type: "SHORT_TEXT", required: true },
  { label: "CIN No.", type: "SHORT_TEXT" },
  { label: "PAN No.", type: "SHORT_TEXT" },
  { label: "GSTIN No.", type: "SHORT_TEXT" },
  { label: "Grievance Officer First Name", type: "SHORT_TEXT" },
  { label: "Grievance Officer Last Name", type: "SHORT_TEXT" },
  { label: "Grievance Officer Email", type: "EMAIL" },
  { label: "Grievance Officer Contact No.", type: "PHONE" },
  { label: "Existing Website Link", type: "SHORT_TEXT" },
  { label: "Login Button Link", type: "SHORT_TEXT" },
  { label: "Signup Button Link", type: "SHORT_TEXT" },
  { label: "Founder & Director Images", type: "FILE_MULTI" },
  { label: "Team Images", type: "FILE_MULTI" },
  { label: "Our Mission", type: "LONG_TEXT" },
  { label: "Our Vision", type: "LONG_TEXT" },
  { label: "Our Purpose", type: "LONG_TEXT" },
  { label: "Client Support Phone No.", type: "PHONE", required: true },
  { label: "Client Support Email", type: "EMAIL", required: true },
  { label: "Street Address", type: "SHORT_TEXT" },
  { label: "Address Line 2", type: "SHORT_TEXT" },
  { label: "City", type: "SHORT_TEXT" },
  { label: "State/Region/Province", type: "SHORT_TEXT" },
  { label: "Postal / Zip Code", type: "SHORT_TEXT" },
  { label: "Country", type: "SHORT_TEXT", placeholder: "India" },
  { label: "Awards & Testimonials", type: "FILE_MULTI" },
  {
    label: "Where is Website Hosted and where is domain managed?",
    type: "DROPDOWN",
    options: [
      "Hostinger (hosting + domain)",
      "GoDaddy (hosting + domain)",
      "Hostinger hosting / GoDaddy domain",
      "GoDaddy hosting / Hostinger domain",
      "Other",
    ].join("|"),
  },
  { label: "Please provide us credentials of hostinger/godaddy/etc", type: "LONG_TEXT" },
];

const ATTACHMENT_FIELD_LABEL: Record<string, string> = {
  LOGO: "Company Logo",
  FOUNDER_DIRECTOR: "Founder & Director Images",
  TEAM: "Team Images",
  AWARDS_TESTIMONIALS: "Awards & Testimonials",
};

async function main() {
  const adapter = new PrismaMariaDb(buildPoolConfig(process.env.DATABASE_URL!));
  const prisma = new PrismaClient({ adapter });

  const submissions = await prisma.onboardingSubmission.findMany({ include: { attachments: true } });

  await prisma.$transaction(
    async (tx) => {
      let form = await tx.form.findUnique({
        where: { slug: SLUG },
        include: { fields: true, _count: { select: { submissions: true } } },
      });

      if (!form) {
        const author = await tx.user.findFirst({ where: { role: "SUPER_ADMIN" }, orderBy: { createdAt: "asc" } });
        if (!author) throw new Error("No SUPER_ADMIN user found to attribute the migrated form to.");
        const created = await tx.form.create({
          data: {
            title: "Website Onboarding Form",
            description: "Collects a new client's company, compliance, and website details.",
            slug: SLUG,
            isActive: true,
            createdById: author.id,
          },
        });
        console.log(`[migrate-onboarding] Created form "${created.title}" (id: ${created.id})`);
        form = { ...created, fields: [], _count: { submissions: 0 } };
      } else {
        console.log(`[migrate-onboarding] Found existing form "${form.title}" (id: ${form.id}, ${form.fields.length} field(s), ${form._count.submissions} submission(s))`);
      }

      if (form.fields.length === 0) {
        form.fields = await Promise.all(
          FIELDS.map((f, order) =>
            tx.formField.create({
              data: {
                formId: form!.id,
                type: f.type,
                label: f.label,
                required: f.required ?? false,
                placeholder: f.placeholder ?? null,
                options: f.options ?? null,
                order,
              },
            })
          )
        );
        console.log(`[migrate-onboarding] Created ${form.fields.length} fields`);
      } else {
        console.log(`[migrate-onboarding] Form already has fields — leaving them as-is, mapping old answers onto them by label`);
      }

      if (form._count.submissions > 0) {
        console.log(`[migrate-onboarding] Form already has submissions — skipping submission migration (already done).`);
        return;
      }

      const fieldIdByLabel = new Map(form.fields.map((f) => [f.label, f.id]));
      const idFor = (label: string) => {
        const id = fieldIdByLabel.get(label);
        if (!id) console.warn(`[migrate-onboarding]   no field on the live form matches "${label}" — skipping that answer`);
        return id;
      };

      console.log(`[migrate-onboarding] Migrating ${submissions.length} existing submission(s)...`);
      for (const s of submissions) {
        const textAnswers: { label: string; value: string | null }[] = [
          { label: "Full Name", value: s.fullName },
          { label: "Phone", value: s.phone },
          { label: "Email", value: s.email },
          { label: "Company Name", value: s.companyName },
          { label: "About Your Company", value: s.aboutCompany },
          { label: "ARN No", value: s.arnNo },
          { label: "ARN Registration and Expiry Dates", value: s.arnRegistration },
          { label: "EUIN No", value: s.euinNo },
          { label: "CIN No.", value: s.cinNo },
          { label: "PAN No.", value: s.panNo },
          { label: "GSTIN No.", value: s.gstinNo },
          { label: "Grievance Officer First Name", value: s.grievanceFirstName },
          { label: "Grievance Officer Last Name", value: s.grievanceLastName },
          { label: "Grievance Officer Email", value: s.grievanceEmail },
          { label: "Grievance Officer Contact No.", value: s.grievanceContact },
          { label: "Existing Website Link", value: s.existingWebsite },
          { label: "Login Button Link", value: s.loginLink },
          { label: "Signup Button Link", value: s.signupLink },
          { label: "Our Mission", value: s.ourMission },
          { label: "Our Vision", value: s.ourVision },
          { label: "Our Purpose", value: s.ourPurpose },
          { label: "Client Support Phone No.", value: s.supportPhone },
          { label: "Client Support Email", value: s.supportEmail },
          { label: "Street Address", value: s.addressStreet },
          { label: "Address Line 2", value: s.addressLine2 },
          { label: "City", value: s.addressCity },
          { label: "State/Region/Province", value: s.addressState },
          { label: "Postal / Zip Code", value: s.addressPostalCode },
          { label: "Country", value: s.addressCountry },
          { label: "Where is Website Hosted and where is domain managed?", value: s.hostingProvider },
          { label: "Please provide us credentials of hostinger/godaddy/etc", value: s.hostingCredentials },
        ];

        const answers = textAnswers
          .filter((a) => a.value && a.value.trim())
          .map((a) => ({ fieldId: idFor(a.label), value: a.value as string }))
          .filter((a): a is { fieldId: string; value: string } => !!a.fieldId);

        const attachments = s.attachments
          .map((a) => ({ fieldId: idFor(ATTACHMENT_FIELD_LABEL[a.kind]), fileName: a.fileName, data: a.data, createdAt: a.createdAt }))
          .filter((a): a is { fieldId: string; fileName: string; data: string; createdAt: Date } => !!a.fieldId);

        await tx.formSubmission.create({
          data: {
            formId: form!.id,
            createdAt: s.createdAt,
            answers: { create: answers },
            attachments: { create: attachments },
          },
        });
        console.log(`[migrate-onboarding]   migrated submission ${s.id} (${answers.length} answer(s), ${attachments.length}/${s.attachments.length} attachment(s))`);
      }
    },
    { timeout: 60_000 }
  );

  console.log("[migrate-onboarding] Done.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[migrate-onboarding] Failed:", err);
  process.exit(1);
});
