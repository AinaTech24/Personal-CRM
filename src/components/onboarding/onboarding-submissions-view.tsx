"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { IconCopy, IconCheck, IconDownload, IconExternalLink, IconEye, IconFileSpreadsheet, IconPaperclip } from "@/components/icons";
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
                    {["Full Name", "Company", "Email", "Phone", "ARN No", "Submitted", "Attachments"].map((h) => (
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
          <DialogHeader>
            <DialogTitle>{detail?.companyName ?? "Submission"}</DialogTitle>
            {detail && <DialogDescription>Submitted {format(parseISO(detail.createdAt), "dd MMM yyyy, h:mm a")}</DialogDescription>}
          </DialogHeader>
          <DialogBody className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            {loadingDetail || !detail ? (
              <SkeletonTable rows={6} columns={2} />
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
        </DialogContent>
      </Dialog>

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
