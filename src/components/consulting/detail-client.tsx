"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import type { FieldMeta, Labels, Row } from "@/lib/mfd/ui-types";
import { RecordForm } from "./record-form";

/** Read view with an Edit switch into the record form. */
export function EditableRecord({
  canEdit,
  slug,
  table,
  fields,
  record,
  labels,
  children,
}: {
  canEdit: boolean;
  slug: string;
  table: string;
  fields: FieldMeta[];
  record: Row;
  labels: Labels;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" variant={editing ? "outline" : "secondary"} onClick={() => setEditing((e) => !e)}>
            {editing ? "Cancel" : "Edit"}
          </Button>
        </div>
      )}
      {editing ? (
        <RecordForm
          slug={slug}
          table={table}
          fields={fields}
          record={record}
          labels={labels}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : (
        children
      )}
    </div>
  );
}

/** "Add" for a child panel: the form opens inline with the parent pinned. */
export function ChildAdd({ slug, table, fields, fixed, label }: { slug: string; table: string; fields: FieldMeta[]; fixed: Row; label: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button size="sm" variant={open ? "outline" : "secondary"} onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : `Add ${label}`}
        </Button>
      </div>
      {open && (
        <div className="rounded-lg border border-border p-4">
          <RecordForm
            slug={slug}
            table={table}
            fields={fields}
            fixed={fixed}
            onDone={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}

export function RemoveLinkButton({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className="text-xs text-destructive hover:underline disabled:opacity-50"
      onClick={async () => {
        if (!window.confirm("Remove this link?")) return;
        setBusy(true);
        const res = await fetch(`/api/v1/${slug}/${id}`, { method: "DELETE" });
        setBusy(false);
        if (!res.ok) toast.error((await res.json().catch(() => ({}))).error ?? "Couldn't remove");
        else router.refresh();
      }}
    >
      Remove
    </button>
  );
}

/** Fetches a short-lived, user-bound link (AT-05) and opens it. */
export function DownloadButton({ fileId, label = "Download", inline = false }: { fileId: string; label?: string; inline?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await fetch(`/api/v1/files/${fileId}`, { cache: "no-store" });
          const data = await res.json();
          if (!res.ok) return toast.error(data.error ?? "Couldn't get the file");
          window.open(`${data.url as string}${inline ? "&inline=1" : ""}`, "_blank", "noopener");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Preparing…" : label}
    </Button>
  );
}
