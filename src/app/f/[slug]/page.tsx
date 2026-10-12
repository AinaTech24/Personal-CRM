"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown } from "@/components/ui/dropdown";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { MAX_DATA_URL_ATTACHMENT_BYTES as MAX_ATTACHMENT_BYTES, MAX_DATA_URL_FILES_PER_FIELD as MAX_FILES_PER_FIELD } from "@/lib/uploads";
import { parseFieldOptions, type FormFieldType } from "@/lib/form-fields";
import { IconX } from "@/components/icons";

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

function FieldInput({ field, value, onChange }: { field: FieldDef; value: AnswerValue | undefined; onChange: (v: AnswerValue) => void }) {
  switch (field.type) {
    case "LONG_TEXT":
      return <Textarea rows={4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder ?? undefined} />;
    case "EMAIL":
      return <Input type="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder ?? undefined} />;
    case "PHONE":
      return <Input type="tel" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder ?? undefined} />;
    case "NUMBER":
      return <Input type="number" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder ?? undefined} />;
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
          {parseFieldOptions(field.options).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case "FILE_SINGLE":
    case "FILE_MULTI": {
      const files = Array.isArray(value) ? (value as PickedFile[]) : [];
      return <FileInput field={field} files={files} onChange={onChange} />;
    }
    default:
      return <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} required={field.required} placeholder={field.placeholder ?? undefined} />;
  }
}

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<FormDef | null | "not-found">(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/forms/by-slug/${params.slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setForm(d?.form ?? "not-found"))
      .catch(() => setForm("not-found"));
  }, [params.slug]);

  function setAnswer(fieldId: string, value: AnswerValue) {
    setAnswers((a) => ({ ...a, [fieldId]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || form === "not-found") return;
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
            <Image src="/logo.png" alt="Aina CRM" width={140} height={58} priority unoptimized className="mx-auto mb-3 h-10 w-auto" />
            <h1 className="text-xl font-semibold">{form.title}</h1>
            {form.description && <p className="mt-1 text-sm text-muted-foreground">{form.description}</p>}
          </div>

          {form.fields.map((field) =>
            field.type === "SECTION_HEADING" ? (
              <div key={field.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
                <h2 className="text-base font-semibold">{field.label}</h2>
                {field.helpText && <p className="text-sm text-muted-foreground">{field.helpText}</p>}
              </div>
            ) : (
              <div key={field.id} className="flex flex-col gap-1.5">
                <Label>
                  {field.label} {field.required && <span className="text-destructive">*</span>}
                </Label>
                {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                <FieldInput field={field} value={answers[field.id]} onChange={(v) => setAnswer(field.id, v)} />
              </div>
            )
          )}

          <Button type="submit" disabled={submitting} className="mt-2 bg-emerald-600 hover:bg-emerald-600/90">
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </form>
      </div>
    </div>
  );
}
