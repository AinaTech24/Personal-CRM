"use client";

import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

function extOf(fileName: string | null) {
  return fileName?.split(".").pop()?.toLowerCase() ?? "";
}

export function AttachmentViewerDialog({
  fileName,
  fileUrl,
  onClose,
}: {
  fileName: string | null;
  fileUrl: string | null;
  onClose: () => void;
}) {
  const ext = extOf(fileName);
  const image = IMAGE_EXTENSIONS.has(ext);
  const pdf = ext === "pdf";
  // Hide the browser's built-in PDF toolbar / side panel so only the document shows.
  const pdfUrl = fileUrl ? `${fileUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH` : null;

  return (
    <Dialog open={!!fileUrl} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="truncate">{fileName ?? "Attachment"}</DialogTitle>
        </DialogHeader>
        <DialogBody className="overflow-hidden p-0">
          {fileUrl && image && (
            <div className="flex h-[75vh] w-full items-center justify-center bg-accent/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl} alt={fileName ?? "Attachment"} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {fileUrl && pdf && (
            <iframe src={pdfUrl!} title={fileName ?? "Document"} className="h-[80vh] w-full border-0 bg-white" />
          )}
          {fileUrl && !image && !pdf && (
            <iframe src={fileUrl} title={fileName ?? "Document"} className="h-[75vh] w-full border-0 bg-white" />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
