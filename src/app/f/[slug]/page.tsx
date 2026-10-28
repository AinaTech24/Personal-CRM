"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/dropdown";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { AttachmentPreview } from "@/components/forms/attachment-preview";
import { Tooltip } from "@/components/ui/tooltip";
import { MAX_DATA_URL_ATTACHMENT_BYTES as MAX_ATTACHMENT_BYTES, MAX_DATA_URL_FILES_PER_FIELD as MAX_FILES_PER_FIELD } from "@/lib/uploads";
import { isFieldVisible, parseFieldOptions, splitIntoPages, validateFieldValue, type FormFieldType } from "@/lib/form-fields";
import { IconChevronLeft, IconChevronRight, IconHelpCircle, IconX } from "@/components/icons";

interface PickedFile {
  fileName: string;
  dataUrl: string;
}

interface FieldDef {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  options: string | null;
  minLength: number | null;
  maxLength: number | null;
  minValue: number | null;
  maxValue: number | null;
  pattern: string | null;
  conditionFieldId: string | null;
  conditionOperator: string | null;
  conditionValue: string | null;
}

interface FormDef {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  fields: FieldDef[];
}

const MAX_MB = MAX_ATTACHMENT_BYTES / (1024 * 1024);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type AnswerValue = string | string[] | PickedFile[];

/** An answer in the same single-string shape conditional logic compares against — pipe-joined for a CHECKBOX, "1"/"" for a file field's presence, as-is for everything else. */
function answerAsString(value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (value.length === 0) return "";
  return typeof value[0] === "string" ? (value as string[]).join("|") : "1";
}

function FileInput({
  field,
  files,
  onChange,
}: {
  field: FieldDef;
  files: PickedFile[];
  onChange: (files: PickedFile[]) => void;
}) {
  const toast = useToast();
  const multiple = field.type === "FILE_MULTI";

  async function onPick(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const limit = multiple ? MAX_FILES_PER_FIELD : 1;
    if (files.length + incoming.length > limit) {
      return toast.error(multiple ? `Up to ${MAX_FILES_PER_FIELD} files allowed` : "Only one file allowed");
    }
    const picked: PickedFile[] = [];
    for (const f of incoming) {
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${f.name} is too large`, `Max ${MAX_MB}MB`);
        continue;
      }
      picked.push({ fileName: f.name, dataUrl: await readAsDataUrl(f) });
    }
    onChange(multiple ? [...files, ...picked] : picked);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {files.length === 0 ? (
        <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:bg-primary/5">
          {multiple ? "Choose File(s)" : "Choose File"}
          <input type="file" multiple={multiple} className="hidden" onChange={(e) => onPick(e.target.files)} />
        </label>
      ) : (
        <div className="flex flex-col gap-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2 truncate">
                <AttachmentPreview fileName={f.fileName} src={f.dataUrl} />
                <span className="truncate">{f.fileName}</span>
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {multiple && files.length < MAX_FILES_PER_FIELD && (
            <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-input px-3 py-2 text-sm text-muted-foreground hover:bg-primary/5">
              Add more
              <input type="file" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** The constraint-validation props a text-like field's minLength/maxLength/pattern rules translate to. */
function lengthConstraints(field: FieldDef) {
  return {
    minLength: field.minLength ?? undefined,
    maxLength: field.maxLength ?? undefined,
    pattern: field.pattern ?? undefined,
    title: field.pattern ? "Doesn't match the required format" : undefined,
  };
}

function FieldInput({ field, value, onChange }: { field: FieldDef; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  switch (field.type) {
    case "LONG_TEXT":
      return (
        <Textarea
          rows={4}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.placeholder ?? undefined}
          {...lengthConstraints(field)}
        />
      );
    case "EMAIL":
      return (
        <Input type="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder ?? undefined} {...lengthConstraints(field)} />
      );
    case "PHONE":
      return (
        <Input type="tel" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder ?? undefined} {...lengthConstraints(field)} />
      );
    case "LINK":
      return (
        <Input type="url" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder ?? "https://..."} {...lengthConstraints(field)} />
      );
    case "PASSWORD":
      return (
        <Input
          type="password"
          autoComplete="off"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.placeholder ?? undefined}
          {...lengthConstraints(field)}
        />
      );
    case "NUMBER":
      return (
        <Input
          type="number"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          placeholder={field.placeholder ?? undefined}
          min={field.minValue ?? undefined}
          max={field.maxValue ?? undefined}
        />
      );
    case "DATE":
      return <Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} />;
    case "DROPDOWN":
      return (
        <Dropdown
          value={(value as string) ?? ""}
          onChange={onChange}
          options={[{ value: "", label: field.placeholder ?? "Select..." }, ...parseFieldOptions(field.options).map((o) => ({ value: o, label: o }))]}
        />
      );
    case "RADIO":
      return (
        <div className="flex flex-col gap-2">
          {parseFieldOptions(field.options).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="radio" name={field.id} value={o} checked={value === o} onChange={() => onChange(o)} required={field.required} />
              {o}
            </label>
          ))}
        </div>
      );
    case "CHECKBOX": {
      const selected = Array.isArray(value) && typeof value[0] !== "object" ? (value as string[]) : [];
      return (
        <div className="flex flex-col gap-2">
          {parseFieldOptions(field.options).map((o) => {
            const checked = selected.includes(o);
            return (
              <label key={o} className="flex items-center gap-2.5 text-sm">
                <Checkbox
                  checked={checked}
                  onChange={(c) => onChange(c ? [...selected, o] : selected.filter((s) => s !== o))}
                  aria-label={o}
                />
                {o}
              </label>
            );
          })}
        </div>
      );
    }
    case "FILE_SINGLE":
    case "FILE_MULTI": {
      const files = Array.isArray(value) ? (value as PickedFile[]) : [];
      return <FileInput field={field} files={files} onChange={onChange} />;
    }
    default:
      return (
        <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder ?? undefined} {...lengthConstraints(field)} />
      );
  }
}

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormDef | null | "not-found">(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  // Read directly from the URL rather than useSearchParams(), which needs a
  // Suspense boundary — not worth adding for two optional query flags. For
  // an embed to match a light host page: ?theme=light forces light mode
  // (independent of the visitor's own OS/app preference), and
  // ?embedded=true drops the Aina CRM logo, since it's redundant chrome
  // inside someone else's page.
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setEmbedded(query.get("embedded") === "true");
    if (query.get("theme") === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
  }, []);

  useEffect(() => {
    fetch(`/api/forms/by-slug/${params.slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setForm(d?.form ?? "not-found"))
      .catch(() => setForm("not-found"));
  }, [params.slug]);

  // Best-effort, fire-and-forget — counted toward the form's analytics, never
  // something a visitor should notice or that submitting depends on.
  useEffect(() => {
    if (form && form !== "not-found") {
      fetch(`/api/forms/by-slug/${params.slug}/view`, { method: "POST" }).catch(() => {});
    }
  }, [form, params.slug]);

  function setAnswer(fieldId: string, value: AnswerValue) {
    setAnswers((a) => ({ ...a, [fieldId]: value }));
  }

  const pages = form && form !== "not-found" ? splitIntoPages(form.fields) : [];
  const answerStrings: Record<string, string> = {};
  if (form && form !== "not-found") {
    for (const f of form.fields) answerStrings[f.id] = answerAsString(answers[f.id]);
  }
  const visibleFields = (pages[page] ?? []).filter((f) => isFieldVisible(f, answerStrings));
  const onLastPage = page >= pages.length - 1;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || form === "not-found") return;

    for (const field of visibleFields) {
      const value = answers[field.id];
      if (typeof value !== "string" || !value.trim()) continue;
      const problem = validateFieldValue(field, value.trim());
      if (problem) return toast.error(onLastPage ? "Couldn't submit the form" : "Can't continue", problem);
    }

    if (!onLastPage) {
      setPage((p) => p + 1);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/by-slug/${params.slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("Couldn't submit the form", data.error);
        return;
      }
      router.push(`/f/${params.slug}/thank-you`);
    } finally {
      setSubmitting(false);
    }
  }

  if (form === null) return null;
  if (form === "not-found") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">This form isn&apos;t available.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="border-b border-border pb-4 text-center">
            {!embedded && (
              <Image src="/logo.png" alt="Aina CRM" width={140} height={58} priority unoptimized className="mx-auto mb-3 h-10 w-auto" />
            )}
            <h1 className="text-xl font-semibold">{form.title}</h1>
            {form.description && <p className="mt-1 text-sm text-muted-foreground">{form.description}</p>}
          </div>

          {pages.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-center text-xs text-muted-foreground">
                Step {page + 1} of {pages.length}
              </p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${((page + 1) / pages.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {visibleFields.map((field) =>
            field.type === "SECTION_HEADING" ? (
              <div key={field.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
                <h2 className="text-base font-semibold">{field.label}</h2>
                {field.helpText && <p className="text-sm text-muted-foreground">{field.helpText}</p>}
              </div>
            ) : (
              <div key={field.id} className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5">
                  {field.label} {field.required && <span className="text-destructive">*</span>}
                  {field.helpText && (
                    <Tooltip label={field.helpText}>
                      <IconHelpCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Tooltip>
                  )}
                </Label>
                <FieldInput field={field} value={answers[field.id]} onChange={(v) => setAnswer(field.id, v)} />
              </div>
            )
          )}

          <div className="mt-2 flex items-center gap-2">
            {page > 0 && (
              <Button type="button" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={submitting}>
                <IconChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Button type="submit" disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-600/90">
              {submitting ? "Submitting..." : onLastPage ? "Submit" : "Next"}
              {!onLastPage && !submitting && <IconChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
