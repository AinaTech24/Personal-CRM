"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EightDotsRotate } from "@/components/ui/loader";
import { IconDownload, IconShare } from "@/components/icons";

/**
 * Shows a rendered invoice/quotation document (print HTML) inside a
 * scrollbar-free iframe. Actions for print and share live in the footer.
 */
export function DocumentPreviewDialog({
  open,
  title,
  html,
  onOpenChange,
  onDownload,
  onShare,
}: {
  open: boolean;
  title: string;
  html: string | null;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void | Promise<void>;
  onShare: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="h-[90vh] max-h-[90vh] w-[820px] max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="overflow-hidden bg-background p-0">
          {html ? (
            <iframe
              title={title}
              srcDoc={html}
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-background">
              <EightDotsRotate className="h-9 w-9" />
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={onShare} className="gap-1.5">
            <IconShare className="h-3.5 w-3.5" />
            Share
          </Button>
          <Button type="button" size="sm" onClick={handleDownload} disabled={downloading || !html} className="gap-1.5">
            <IconDownload className="h-3.5 w-3.5" />
            {downloading ? "Preparing…" : "Download PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
