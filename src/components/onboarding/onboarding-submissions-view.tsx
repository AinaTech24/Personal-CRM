"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RowActionsMenu } from "@/components/ui/row-actions";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import {
  IconCopy,
  IconCheck,
  IconDownload,
  IconExternalLink,
  IconEye,
  IconFileSpreadsheet,
  IconPaperclip,
  IconPencil,
  IconTrash,
} from "@/components/icons";
import { cn } from "@/lib/utils";

interface SubmissionRow {
  id: string;
  fullName: string;
  companyName: string;
  email: string;
  phone: string;
  arnNo: string;
  createdAt: string;
  _count: { attachments: number };
}

interface Attachment {
  id: string;
  kind: "LOGO" | "FOUNDER_DIRECTOR" | "TEAM" | "AWARDS_TESTIMONIALS";
  fileName: string;
  createdAt: string;
}

interface SubmissionDetail extends Omit<SubmissionRow, "_count"> {
  companyName: string;
  aboutCompany: string;
  arnRegistration: string;
  euinNo: string;
  cinNo: string | null;
  panNo: string | null;
  gstinNo: string | null;
  grievanceFirstName: string | null;
  grievanceLastName: string | null;
  grievanceEmail: string | null;
  grievanceContact: string | null;
  existingWebsite: string | null;
  loginLink: string | null;
  signupLink: string | null;
  ourMission: string | null;
  ourVision: string | null;
  ourPurpose: string | null;
  supportPhone: string;
  supportEmail: string;
  addressStreet: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  hostingProvider: string | null;
  hostingCredentials: string | null;
  attachments: Attachment[];
}

const ATTACHMENT_KIND_LABEL: Record<Attachment["kind"], string> = {
  LOGO: "Company Logo",
  FOUNDER_DIRECTOR: "Founder & Director Images",
  TEAM: "Team Images",
  AWARDS_TESTIMONIALS: "Awards & Testimonials",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 py-1.5 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="whitespace-pre-wrap break-words">{value}</span>
    </div>
  );
}

/** Keys editable from the admin table. Attachments aren't editable here — delete the submission and ask for a fresh one if a file needs replacing. */
const EDITABLE_KEYS = [
  "fullName",
  "phone",
  "email",
  "companyName",
  "aboutCompany",
  "arnNo",
  "arnRegistration",
  "euinNo",
  "cinNo",
  "panNo",
  "gstinNo",
  "grievanceFirstName",
  "grievanceLastName",
  "grievanceEmail",
  "grievanceContact",
  "existingWebsite",
  "loginLink",
  "signupLink",
  "ourMission",
  "ourVision",
  "ourPurpose",
  "supportPhone",
  "supportEmail",
  "addressStreet",
  "addressLine2",
  "addressCity",
  "addressState",
  "addressPostalCode",
  "addressCountry",
  "hostingProvider",
  "hostingCredentials",
] as const satisfies readonly (keyof SubmissionDetail)[];
type EditableKey = (typeof EDITABLE_KEYS)[number];
type EditForm = Record<EditableKey, string>;

function EditField({
  label,
  field,
  value,
  onChange,
  multiline,
}: {
  label: string;
  field: EditableKey;
  value: string;
  onChange: (field: EditableKey, value: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      {multiline ? (
        <Textarea rows={2} value={value} onChange={(e) => onChange(field, e.target.value)} />
      ) : (
        <Input value={value} onChange={(e) => onChange(field, e.target.value)} />
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 pb-4 last:border-0 last:pb-0">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">{title}</h3>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function AttachmentGroup({ submissionId, kind, items }: { submissionId: string; kind: Attachment["kind"]; items: Attachment[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground">{ATTACHMENT_KIND_LABEL[kind]}</p>
      <div className="flex flex-col gap-1">
        {items.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <IconPaperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{a.fileName}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Tooltip label="View">
                <a
                  href={`/api/onboarding-submissions/${submissionId}/attachments/${a.id}?mode=view`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                >
                  <IconEye className="h-3.5 w-3.5" />
                </a>
              </Tooltip>
              <Tooltip label="Download">
                <a
                  href={`/api/onboarding-submissions/${submissionId}/attachments/${a.id}`}
                  className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                >
                  <IconDownload className="h-3.5 w-3.5" />
                </a>
              </Tooltip>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OnboardingSubmissionsView() {
  const toast = useToast();
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleting, setDeleting] = useState<SubmissionRow | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/onboarding-submissions");
    setRows(res.ok ? (await res.json()).submissions : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      setEditMode(false);
      setEditForm(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/onboarding-submissions/${openId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.submission ?? null))
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [openId]);

  async function copyLink() {
    const url = `${window.location.origin}/onboarding-form`;
    await navigator.clipboard.writeText(url);
    toast.success("Form link copied");
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  function startEdit() {
    if (!detail) return;
    const form = {} as EditForm;
    for (const key of EDITABLE_KEYS) form[key] = detail[key] ?? "";
    setEditForm(form);
    setEditMode(true);
  }

  function setEditField(field: EditableKey, value: string) {
    setEditForm((f) => (f ? { ...f, [field]: value } : f));
  }

  async function saveEdit() {
    if (!detail || !editForm) return;
    setSavingEdit(true);
    try {
      const orNull = (v: string) => v.trim() || null;
      const res = await fetch(`/api/onboarding-submissions/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editForm.fullName,
          phone: editForm.phone,
          email: editForm.email,
          companyName: editForm.companyName,
          aboutCompany: editForm.aboutCompany,
          arnNo: editForm.arnNo,
          arnRegistration: editForm.arnRegistration,
          euinNo: editForm.euinNo,
          cinNo: orNull(editForm.cinNo),
          panNo: orNull(editForm.panNo),
          gstinNo: orNull(editForm.gstinNo),
          grievanceFirstName: orNull(editForm.grievanceFirstName),
          grievanceLastName: orNull(editForm.grievanceLastName),
          grievanceEmail: orNull(editForm.grievanceEmail),
          grievanceContact: orNull(editForm.grievanceContact),
          existingWebsite: orNull(editForm.existingWebsite),
          loginLink: orNull(editForm.loginLink),
          signupLink: orNull(editForm.signupLink),
          ourMission: orNull(editForm.ourMission),
          ourVision: orNull(editForm.ourVision),
          ourPurpose: orNull(editForm.ourPurpose),
          supportPhone: editForm.supportPhone,
          supportEmail: editForm.supportEmail,
          addressStreet: orNull(editForm.addressStreet),
          addressLine2: orNull(editForm.addressLine2),
          addressCity: orNull(editForm.addressCity),
          addressState: orNull(editForm.addressState),
          addressPostalCode: orNull(editForm.addressPostalCode),
          addressCountry: orNull(editForm.addressCountry),
          hostingProvider: orNull(editForm.hostingProvider),
          hostingCredentials: orNull(editForm.hostingCredentials),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error("Couldn't save changes", data.error);
      setDetail(data.submission);
      setEditMode(false);
      toast.success("Submission updated");
      load();
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const res = await fetch(`/api/onboarding-submissions/${deleting.id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Couldn't delete the submission");
    else toast.success("Submission deleted", deleting.fullName);
    setDeleting(null);
    if (openId === deleting.id) setOpenId(null);
    load();
  }

  const byKind = (kind: Attachment["kind"]) => detail?.attachments.filter((a) => a.kind === kind) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Website Onboarding Form</h1>
          <p className="text-sm text-muted-foreground">Submissions from clients filling out the public onboarding form.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
            <IconExternalLink className="h-4 w-4" />
            Preview form
          </Button>
          <Button type="button" variant="outline" onClick={copyLink}>
            <span className="relative flex h-4 w-4 items-center justify-center">
              <IconCopy className={cn("absolute h-4 w-4 transition-all duration-200", copied ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
              <IconCheck
                className={cn("absolute h-4 w-4 text-emerald-500 transition-all duration-200", copied ? "scale-100 opacity-100" : "scale-50 opacity-0")}
              />
            </span>
            {copied ? "Copied" : "Copy form link"}
          </Button>
        </div>
      </div>

      {!rows ? (
        <SkeletonTable rows={5} columns={6} />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <IconFileSpreadsheet className="h-6 w-6" />
            No submissions yet. Share the form link to start collecting them.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    {["Full Name", "Company", "Email", "Phone", "ARN No", "Submitted", "Attachments", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-primary/5"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{r.fullName}</td>
                      <td className="whitespace-nowrap px-4 py-3">{r.companyName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{r.email}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{r.phone}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{r.arnNo}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{format(parseISO(r.createdAt), "dd MMM yyyy")}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{r._count.attachments}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <RowActionsMenu
                          label={`Actions for ${r.fullName}`}
                          actions={[
                            { key: "edit", label: "Edit", icon: <IconPencil className="h-4 w-4" />, onSelect: () => { setOpenId(r.id); } },
                            {
                              key: "delete",
                              label: "Delete",
                              icon: <IconTrash className="h-4 w-4" />,
                              destructive: true,
                              onSelect: () => setDeleting(r),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={openId !== null} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent size="lg">
          <DialogHeader className="flex-row items-start justify-between gap-3">
            <div>
              <DialogTitle>{detail?.companyName ?? "Submission"}</DialogTitle>
              {detail && <DialogDescription>Submitted {format(parseISO(detail.createdAt), "dd MMM yyyy, h:mm a")}</DialogDescription>}
            </div>
            {detail && !editMode && (
              <Button type="button" size="sm" variant="outline" onClick={startEdit}>
                <IconPencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            )}
          </DialogHeader>
          <DialogBody className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            {loadingDetail || !detail ? (
              <SkeletonTable rows={6} columns={2} />
            ) : editMode && editForm ? (
              <>
                <Section title="Contact">
                  <EditField label="Full Name" field="fullName" value={editForm.fullName} onChange={setEditField} />
                  <EditField label="Phone" field="phone" value={editForm.phone} onChange={setEditField} />
                  <EditField label="Email" field="email" value={editForm.email} onChange={setEditField} />
                  <EditField label="Company Name" field="companyName" value={editForm.companyName} onChange={setEditField} />
                </Section>
                <Section title="About">
                  <div className="sm:col-span-2">
                    <EditField label="About Your Company" field="aboutCompany" value={editForm.aboutCompany} onChange={setEditField} multiline />
                  </div>
                </Section>
                <Section title="Compliance">
                  <EditField label="ARN No" field="arnNo" value={editForm.arnNo} onChange={setEditField} />
                  <EditField label="EUIN No" field="euinNo" value={editForm.euinNo} onChange={setEditField} />
                  <div className="sm:col-span-2">
                    <EditField label="ARN Registration and Expiry Dates" field="arnRegistration" value={editForm.arnRegistration} onChange={setEditField} multiline />
                  </div>
                  <EditField label="CIN No." field="cinNo" value={editForm.cinNo} onChange={setEditField} />
                  <EditField label="PAN No." field="panNo" value={editForm.panNo} onChange={setEditField} />
                  <EditField label="GSTIN No." field="gstinNo" value={editForm.gstinNo} onChange={setEditField} />
                </Section>
                <Section title="Grievance Officer">
                  <EditField label="First Name" field="grievanceFirstName" value={editForm.grievanceFirstName} onChange={setEditField} />
                  <EditField label="Last Name" field="grievanceLastName" value={editForm.grievanceLastName} onChange={setEditField} />
                  <EditField label="Email" field="grievanceEmail" value={editForm.grievanceEmail} onChange={setEditField} />
                  <EditField label="Contact No." field="grievanceContact" value={editForm.grievanceContact} onChange={setEditField} />
                </Section>
                <Section title="Links">
                  <EditField label="Existing Website" field="existingWebsite" value={editForm.existingWebsite} onChange={setEditField} />
                  <EditField label="Login Button Link" field="loginLink" value={editForm.loginLink} onChange={setEditField} />
                  <EditField label="Signup Button Link" field="signupLink" value={editForm.signupLink} onChange={setEditField} />
                </Section>
                <Section title="About the company">
                  <div className="sm:col-span-2 flex flex-col gap-3">
                    <EditField label="Our Mission" field="ourMission" value={editForm.ourMission} onChange={setEditField} multiline />
                    <EditField label="Our Vision" field="ourVision" value={editForm.ourVision} onChange={setEditField} multiline />
                    <EditField label="Our Purpose" field="ourPurpose" value={editForm.ourPurpose} onChange={setEditField} multiline />
                  </div>
                </Section>
                <Section title="Client Support">
                  <EditField label="Phone" field="supportPhone" value={editForm.supportPhone} onChange={setEditField} />
                  <EditField label="Email" field="supportEmail" value={editForm.supportEmail} onChange={setEditField} />
                </Section>
                <Section title="Company Address">
                  <EditField label="Street" field="addressStreet" value={editForm.addressStreet} onChange={setEditField} />
                  <EditField label="Line 2" field="addressLine2" value={editForm.addressLine2} onChange={setEditField} />
                  <EditField label="City" field="addressCity" value={editForm.addressCity} onChange={setEditField} />
                  <EditField label="State" field="addressState" value={editForm.addressState} onChange={setEditField} />
                  <EditField label="Postal Code" field="addressPostalCode" value={editForm.addressPostalCode} onChange={setEditField} />
                  <EditField label="Country" field="addressCountry" value={editForm.addressCountry} onChange={setEditField} />
                </Section>
                <Section title="Hosting">
                  <div className="sm:col-span-2 flex flex-col gap-3">
                    <EditField label="Where hosted / domain managed" field="hostingProvider" value={editForm.hostingProvider} onChange={setEditField} />
                    <EditField label="Credentials" field="hostingCredentials" value={editForm.hostingCredentials} onChange={setEditField} multiline />
                  </div>
                </Section>
                <p className="text-xs text-muted-foreground">Attachments aren&apos;t editable here — delete the submission and ask for a fresh one if a file needs replacing.</p>
              </>
            ) : (
              <>
                <Section title="Contact">
                  <Row label="Full Name" value={detail.fullName} />
                  <Row label="Phone" value={detail.phone} />
                  <Row label="Email" value={detail.email} />
                  <Row label="Company Name" value={detail.companyName} />
                </Section>
                <Section title="About">
                  <div className="sm:col-span-2">
                    <Row label="About Your Company" value={detail.aboutCompany} />
                  </div>
                </Section>
                <Section title="Compliance">
                  <Row label="ARN No" value={detail.arnNo} />
                  <Row label="EUIN No" value={detail.euinNo} />
                  <div className="sm:col-span-2">
                    <Row label="ARN Registration and Expiry Dates" value={detail.arnRegistration} />
                  </div>
                  <Row label="CIN No." value={detail.cinNo} />
                  <Row label="PAN No." value={detail.panNo} />
                  <Row label="GSTIN No." value={detail.gstinNo} />
                </Section>
                <Section title="Grievance Officer">
                  <Row label="Name" value={[detail.grievanceFirstName, detail.grievanceLastName].filter(Boolean).join(" ")} />
                  <Row label="Email" value={detail.grievanceEmail} />
                  <Row label="Contact No." value={detail.grievanceContact} />
                </Section>
                <Section title="Links">
                  <Row label="Existing Website" value={detail.existingWebsite} />
                  <Row label="Login Button Link" value={detail.loginLink} />
                  <Row label="Signup Button Link" value={detail.signupLink} />
                </Section>
                <Section title="About the company">
                  <div className="sm:col-span-2">
                    <Row label="Our Mission" value={detail.ourMission} />
                    <Row label="Our Vision" value={detail.ourVision} />
                    <Row label="Our Purpose" value={detail.ourPurpose} />
                  </div>
                </Section>
                <Section title="Client Support">
                  <Row label="Phone" value={detail.supportPhone} />
                  <Row label="Email" value={detail.supportEmail} />
                </Section>
                <Section title="Company Address">
                  <div className="sm:col-span-2">
                    <Row
                      label="Address"
                      value={[detail.addressStreet, detail.addressLine2, detail.addressCity, detail.addressState, detail.addressPostalCode, detail.addressCountry]
                        .filter(Boolean)
                        .join(", ")}
                    />
                  </div>
                </Section>
                <Section title="Hosting">
                  <Row label="Where hosted / domain managed" value={detail.hostingProvider} />
                  <div className="sm:col-span-2">
                    <Row label="Credentials" value={detail.hostingCredentials} />
                  </div>
                </Section>
                {detail.attachments.length > 0 && (
                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Attachments</h3>
                    <AttachmentGroup submissionId={detail.id} kind="LOGO" items={byKind("LOGO")} />
                    <AttachmentGroup submissionId={detail.id} kind="FOUNDER_DIRECTOR" items={byKind("FOUNDER_DIRECTOR")} />
                    <AttachmentGroup submissionId={detail.id} kind="TEAM" items={byKind("TEAM")} />
                    <AttachmentGroup submissionId={detail.id} kind="AWARDS_TESTIMONIALS" items={byKind("AWARDS_TESTIMONIALS")} />
                  </div>
                )}
              </>
            )}
          </DialogBody>
          {editMode && (
            <DialogFooter>
              <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditMode(false)}>
                Cancel
              </Button>
              <Button type="button" disabled={savingEdit} onClick={saveEdit}>
                {savingEdit ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Delete this submission?"
        description={deleting ? `${deleting.fullName}'s submission from ${deleting.companyName}, including its attachments, will be permanently deleted.` : ""}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent size="lg" className="h-[90dvh] max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle>Form preview</DialogTitle>
            <DialogDescription>What a client sees at the public link.</DialogDescription>
          </DialogHeader>
          <DialogBody className="p-0">
            {previewOpen && <iframe src="/onboarding-form" title="Website Onboarding Form preview" className="h-full w-full border-0" />}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
