"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SkeletonTable } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/providers/toast-provider";
import { IconCheck, IconCopy, IconDownload, IconExternalLink, IconEye, IconFileSpreadsheet, IconPaperclip } from "@/components/icons";
import { cn } from "@/lib/utils";

interface SubmissionRow {
  id: string;
  createdAt: string;
  _count: { attachments: number };
  answers: { value: string; field: { label: string } }[];
}

interface AnswerDetail {
  id: string;
  value: string;
  field: { id: string; label: string; type: string };
}

interface AttachmentDetail {
  id: string;
  fileName: string;
  createdAt: string;
  field: { id: string; label: string };
}

interface SubmissionDetail {
  id: string;
  createdAt: string;
  answers: AnswerDetail[];
  attachments: AttachmentDetail[];
}

export function FormSubmissionsView({ formId }: { formId: string }) {
  const toast = useToast();
  const [form, setForm] = useState<{ title: string; slug: string } | null>(null);
  const [rows, setRows] = useState<SubmissionRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const [formRes, subsRes] = await Promise.all([fetch(`/api/forms/${formId}`), fetch(`/api/forms/${formId}/submissions`)]);
    if (formRes.ok) setForm((await formRes.json()).form);
    setRows(subsRes.ok ? (await subsRes.json()).submissions : []);
  }, [formId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    fetch(`/api/forms/${formId}/submissions/${openId}`)
      .then((r) => r.json())
      .then((d) => setDetail(d.submission ?? null))
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [formId, openId]);

  async function copyLink() {
    if (!form) return;
    await navigator.clipboard.writeText(`${window.location.origin}/f/${form.slug}`);
    toast.success("Form link copied");
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  }

  // Group attachments by their field so the detail view reads like the public form's own layout.
  const attachmentsByField = new Map<string, { label: string; items: AttachmentDetail[] }>();
  for (const a of detail?.attachments ?? []) {
    const existing = attachmentsByField.get(a.field.id);
    if (existing) existing.items.push(a);
    else attachmentsByField.set(a.field.id, { label: a.field.label, items: [a] });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{form?.title ?? "Submissions"}</h1>
          <p className="text-sm text-muted-foreground">Responses collected from the public form.</p>
        </div>
        {form && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
              <IconExternalLink className="h-4 w-4" />
              Preview form
            </Button>
            <Button type="button" variant="outline" onClick={copyLink}>
              <span className="relative flex h-4 w-4 items-center justify-center">
                <IconCopy className={cn("absolute h-4 w-4 transition-all duration-200", copied ? "scale-50 opacity-0" : "scale-100 opacity-100")} />
                <IconCheck className={cn("absolute h-4 w-4 text-emerald-500 transition-all duration-200", copied ? "scale-100 opacity-100" : "scale-50 opacity-0")} />
              </span>
              {copied ? "Copied" : "Copy form link"}
            </Button>
          </div>
        )}
      </div>

      {!rows ? (
        <SkeletonTable rows={5} columns={4} />
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
                    <th className="px-4 py-2.5 font-medium">Preview</th>
                    <th className="px-4 py-2.5 font-medium">Submitted</th>
                    <th className="px-4 py-2.5 font-medium">Attachments</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer border-b border-border/50 last:border-0 hover:bg-primary/5">
                      <td className="px-4 py-3">
                        {r.answers.length > 0 ? (
                          <span className="truncate">
                            {r.answers.map((a) => a.value).join(" · ")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{format(parseISO(r.createdAt), "dd MMM yyyy, h:mm a")}</td>
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
            <DialogTitle>Submission</DialogTitle>
            {detail && <DialogDescription>Submitted {format(parseISO(detail.createdAt), "dd MMM yyyy, h:mm a")}</DialogDescription>}
          </DialogHeader>
          <DialogBody className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
            {loadingDetail || !detail ? (
              <SkeletonTable rows={6} columns={2} />
            ) : (
              <>
                {detail.answers.map((a) => (
                  <div key={a.id} className="flex flex-col gap-0.5 text-sm">
                    <span className="text-xs text-muted-foreground">{a.field.label}</span>
                    <span className="whitespace-pre-wrap break-words">{a.value.replace(/\|/g, ", ")}</span>
                  </div>
                ))}
                {attachmentsByField.size > 0 && (
                  <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Attachments</h3>
                    {Array.from(attachmentsByField.values()).map(({ label, items }) => (
                      <div key={label} className="flex flex-col gap-1.5">
                        <p className="text-xs text-muted-foreground">{label}</p>
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
                                    href={`/api/forms/${formId}/submissions/${detail.id}/attachments/${a.id}?mode=view`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                                  >
                                    <IconEye className="h-3.5 w-3.5" />
                                  </a>
                                </Tooltip>
                                <Tooltip label="Download">
                                  <a
                                    href={`/api/forms/${formId}/submissions/${detail.id}/attachments/${a.id}`}
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
                    ))}
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
            <DialogDescription>What a visitor sees at the public link.</DialogDescription>
          </DialogHeader>
          <DialogBody className="p-0">
            {previewOpen && form && <iframe src={`/f/${form.slug}`} title={`${form.title} preview`} className="h-full w-full border-0" />}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
