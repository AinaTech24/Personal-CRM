"use client";

import { attachmentKindFor } from "@/lib/form-fields";
import { IconFile, IconFileSpreadsheet, IconFileZip } from "@/components/icons";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  spreadsheet: IconFileSpreadsheet,
  archive: IconFileZip,
  file: IconFile,
} as const;

/** A real thumbnail for an image file, otherwise a type-appropriate icon — used for both an already-uploaded attachment (src = its serving URL) and a freshly-picked one awaiting upload (src = its data URL). */
export function AttachmentPreview({ fileName, src, className }: { fileName: string; src: string; className?: string }) {
  const kind = attachmentKindFor(fileName);

  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn("h-9 w-9 shrink-0 rounded object-cover", className)} />;
  }

  const Icon = KIND_ICON[kind];
  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground", className)}>
      <Icon className="h-4 w-4" />
    </span>
  );
}
