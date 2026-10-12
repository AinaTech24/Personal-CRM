"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/dropdown";
import { useToast } from "@/components/providers/toast-provider";
import { MAX_ATTACHMENT_BYTES, MAX_FILES_PER_FIELD } from "@/lib/onboarding";
import { IconX } from "@/components/icons";

interface PickedFile {
  fileName: string;
  dataUrl: string;
}

const HOSTING_OPTIONS = [
  { value: "", label: "Select..." },
  { value: "Hostinger (hosting + domain)", label: "Hostinger (hosting + domain)" },
  { value: "GoDaddy (hosting + domain)", label: "GoDaddy (hosting + domain)" },
  { value: "Hostinger hosting / GoDaddy domain", label: "Hostinger hosting / GoDaddy domain" },
  { value: "GoDaddy hosting / Hostinger domain", label: "GoDaddy hosting / Hostinger domain" },
  { value: "Other", label: "Other" },
];

const MAX_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ACCEPTED_IMAGE = "image/png,image/jpeg,image/webp,image/gif";
const ACCEPTED_IMAGE_OR_PDF = `${ACCEPTED_IMAGE},application/pdf`;

/** A single-file picker (Company Logo). */
function SingleFileField({
  label,
  file,
  onChange,
  accept = ACCEPTED_IMAGE,
}: {
  label: string;
  file: PickedFile | null;
  onChange: (file: PickedFile | null) => void;
  accept?: string;
}) {
  const toast = useToast();

  async function onPick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_ATTACHMENT_BYTES) return toast.error(`${f.name} is too large`, `Max ${MAX_MB}MB`);
    onChange({ fileName: f.name, dataUrl: await readAsDataUrl(f) });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {file ? (
        <div className="flex items-center justify-between rounded-md border border-dashed border-input px-3 py-2 text-sm">
          <span className="truncate">{file.fileName}</span>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:bg-primary/5">
          Choose File
          <input type="file" accept={accept} className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
        </label>
      )}
    </div>
  );
}

/** A multi-file picker (Founder & Director Images, Team Images, Awards & Testimonials). */
function MultiFileField({
  label,
  files,
  onChange,
  accept = ACCEPTED_IMAGE,
}: {
  label: string;
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
  accept?: string;
}) {
  const toast = useToast();

  async function onPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    if (files.length + incoming.length > MAX_FILES_PER_FIELD) {
      return toast.error(`Up to ${MAX_FILES_PER_FIELD} files allowed`);
    }
    const picked: PickedFile[] = [];
    for (const f of incoming) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${f.name} is too large`, `Max ${MAX_MB}MB`);
        continue;
      }
      picked.push({ fileName: f.name, dataUrl: await readAsDataUrl(f) });
    }
    onChange([...files, ...picked]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:bg-primary/5">
        Choose File(s)
        <input type="file" accept={accept} multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
      </label>
      {files.length > 0 && (
        <div className="flex flex-col gap-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm">
              <span className="truncate">{f.fileName}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  companyName: string;
  aboutCompany: string;
  arnNo: string;
  arnRegistration: string;
  euinNo: string;
  cinNo: string;
  panNo: string;
  gstinNo: string;
  grievanceFirstName: string;
  grievanceLastName: string;
  grievanceEmail: string;
  grievanceContact: string;
  existingWebsite: string;
  loginLink: string;
  signupLink: string;
  ourMission: string;
  ourVision: string;
  ourPurpose: string;
  supportPhone: string;
  supportEmail: string;
  addressStreet: string;
  addressLine2: string;
  addressCity: string;
  addressState: string;
  addressPostalCode: string;
  addressCountry: string;
  hostingProvider: string;
  hostingCredentials: string;
}

const INITIAL_STATE: FormState = {
  fullName: "",
  phone: "",
  email: "",
  companyName: "",
  aboutCompany: "",
  arnNo: "",
  arnRegistration: "",
  euinNo: "",
  cinNo: "",
  panNo: "",
  gstinNo: "",
  grievanceFirstName: "",
  grievanceLastName: "",
  grievanceEmail: "",
  grievanceContact: "",
  existingWebsite: "",
  loginLink: "",
  signupLink: "",
  ourMission: "",
  ourVision: "",
  ourPurpose: "",
  supportPhone: "",
  supportEmail: "",
  addressStreet: "",
  addressLine2: "",
  addressCity: "",
  addressState: "",
  addressPostalCode: "",
  addressCountry: "India",
  hostingProvider: "",
  hostingCredentials: "",
};

export default function OnboardingFormPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [logo, setLogo] = useState<PickedFile | null>(null);
  const [founderDirectorImages, setFounderDirectorImages] = useState<PickedFile[]>([]);
  const [teamImages, setTeamImages] = useState<PickedFile[]>([]);
  const [awardsTestimonials, setAwardsTestimonials] = useState<PickedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const orNull = (v: string) => v.trim() || null;
      const res = await fetch("/api/onboarding-submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          phone: form.phone,
          email: form.email,
          companyName: form.companyName,
          aboutCompany: form.aboutCompany,
          arnNo: form.arnNo,
          arnRegistration: form.arnRegistration,
          euinNo: form.euinNo,
          cinNo: orNull(form.cinNo),
          panNo: orNull(form.panNo),
          gstinNo: orNull(form.gstinNo),
          grievanceFirstName: orNull(form.grievanceFirstName),
          grievanceLastName: orNull(form.grievanceLastName),
          grievanceEmail: orNull(form.grievanceEmail),
          grievanceContact: orNull(form.grievanceContact),
          existingWebsite: orNull(form.existingWebsite),
          loginLink: orNull(form.loginLink),
          signupLink: orNull(form.signupLink),
          ourMission: orNull(form.ourMission),
          ourVision: orNull(form.ourVision),
          ourPurpose: orNull(form.ourPurpose),
          supportPhone: form.supportPhone,
          supportEmail: form.supportEmail,
          addressStreet: orNull(form.addressStreet),
          addressLine2: orNull(form.addressLine2),
          addressCity: orNull(form.addressCity),
          addressState: orNull(form.addressState),
          addressPostalCode: orNull(form.addressPostalCode),
          addressCountry: orNull(form.addressCountry),
          hostingProvider: orNull(form.hostingProvider),
          hostingCredentials: orNull(form.hostingCredentials),
          logo,
          founderDirectorImages,
          teamImages,
          awardsTestimonials,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't submit the form", data.error);
        return;
      }
      router.push("/onboarding-form/thank-you");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-2xl">
        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8"
        >
          <div className="border-b border-border pb-4 text-center">
            <Image src="/logo.png" alt="Aina CRM" width={140} height={58} priority unoptimized className="mx-auto mb-3 h-10 w-auto" />
            <h1 className="text-xl font-semibold">Website Onboarding Form</h1>
          </div>

          <Field label="Full Name" required>
            <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} required />
          </Field>
          <Field label="Phone" required>
            <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
          </Field>
          <Field label="Company Name" required>
            <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} required />
          </Field>
          <Field label="About Your Company" required>
            <Textarea rows={4} value={form.aboutCompany} onChange={(e) => set("aboutCompany", e.target.value)} required />
          </Field>
          <SingleFileField label="Company Logo" file={logo} onChange={setLogo} />

          <Field label="ARN No" required>
            <Input value={form.arnNo} onChange={(e) => set("arnNo", e.target.value)} required />
          </Field>
          <Field label="ARN Registration and Expiry Dates" required>
            <Textarea rows={3} value={form.arnRegistration} onChange={(e) => set("arnRegistration", e.target.value)} required />
          </Field>
          <Field label="EUIN No" required>
            <Input value={form.euinNo} onChange={(e) => set("euinNo", e.target.value)} required />
          </Field>
          <Field label="CIN No.">
            <Input value={form.cinNo} onChange={(e) => set("cinNo", e.target.value)} />
          </Field>
          <Field label="PAN No.">
            <Input value={form.panNo} onChange={(e) => set("panNo", e.target.value)} />
          </Field>
          <Field label="GSTIN No.">
            <Input value={form.gstinNo} onChange={(e) => set("gstinNo", e.target.value)} />
          </Field>

          <Field label="Grievance Officer Name">
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="First Name" value={form.grievanceFirstName} onChange={(e) => set("grievanceFirstName", e.target.value)} />
              <Input placeholder="Last Name" value={form.grievanceLastName} onChange={(e) => set("grievanceLastName", e.target.value)} />
            </div>
          </Field>
          <Field label="Grievance Officer Email">
            <Input type="email" value={form.grievanceEmail} onChange={(e) => set("grievanceEmail", e.target.value)} />
          </Field>
          <Field label="Grievance Officer Contact No.">
            <Input value={form.grievanceContact} onChange={(e) => set("grievanceContact", e.target.value)} />
          </Field>

          <Field label="Existing Website Link">
            <Input value={form.existingWebsite} onChange={(e) => set("existingWebsite", e.target.value)} />
          </Field>
          <Field label="Login Button Link">
            <Input value={form.loginLink} onChange={(e) => set("loginLink", e.target.value)} />
          </Field>
          <Field label="Signup Button Link">
            <Input value={form.signupLink} onChange={(e) => set("signupLink", e.target.value)} />
          </Field>

          <MultiFileField label="Founder & Director Images" files={founderDirectorImages} onChange={setFounderDirectorImages} />
          <MultiFileField label="Team Images" files={teamImages} onChange={setTeamImages} />

          <Field label="Our Mission">
            <Textarea rows={3} value={form.ourMission} onChange={(e) => set("ourMission", e.target.value)} />
          </Field>
          <Field label="Our Vision">
            <Textarea rows={3} value={form.ourVision} onChange={(e) => set("ourVision", e.target.value)} />
          </Field>
          <Field label="Our Purpose">
            <Textarea rows={3} value={form.ourPurpose} onChange={(e) => set("ourPurpose", e.target.value)} />
          </Field>

          <Field label="Client Support Phone No." required>
            <Input value={form.supportPhone} onChange={(e) => set("supportPhone", e.target.value)} required />
          </Field>
          <Field label="Client Support Email" required>
            <Input type="email" value={form.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} required />
          </Field>

          <Field label="Company Address">
            <div className="flex flex-col gap-2">
              <Input placeholder="Street Address" value={form.addressStreet} onChange={(e) => set("addressStreet", e.target.value)} />
              <Input placeholder="Address Line 2" value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="City" value={form.addressCity} onChange={(e) => set("addressCity", e.target.value)} />
                <Input placeholder="State/Region/Province" value={form.addressState} onChange={(e) => set("addressState", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Postal / Zip Code" value={form.addressPostalCode} onChange={(e) => set("addressPostalCode", e.target.value)} />
                <Input placeholder="Country" value={form.addressCountry} onChange={(e) => set("addressCountry", e.target.value)} />
              </div>
            </div>
          </Field>

          <MultiFileField label="Awards & Testimonials" files={awardsTestimonials} onChange={setAwardsTestimonials} accept={ACCEPTED_IMAGE_OR_PDF} />

          <Field label="Where is Website Hosted and where is domain managed?">
            <Dropdown value={form.hostingProvider} onChange={(v) => set("hostingProvider", v)} options={HOSTING_OPTIONS} placeholder="Select..." />
          </Field>
          <Field label="Please provide us credentials of hostinger/godaddy/etc">
            <Textarea rows={3} value={form.hostingCredentials} onChange={(e) => set("hostingCredentials", e.target.value)} />
          </Field>

          <Button type="submit" disabled={submitting} className="mt-2 bg-emerald-600 hover:bg-emerald-600/90">
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
