"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  /** Shown while onConfirm runs. Defaults to the delete wording this dialog was built for. */
  loadingLabel?: string;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  loadingLabel = "Deleting...",
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent
        role="alertdialog"
        onOpenAutoFocus={(e) => {
          // Pins focus to Cancel explicitly rather than relying on DOM/tab
          // order to keep it first — this is a destructive confirmation, so
          // an Enter press right after opening must land on Cancel, not Delete.
          e.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex justify-end gap-2">
            <Button ref={cancelRef} type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={loading} onClick={handleConfirm}>
              {loading ? loadingLabel : confirmLabel}
            </Button>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
