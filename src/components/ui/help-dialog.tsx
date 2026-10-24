"use client";

import { useState } from "react";
import { IconHelpCircle } from "@/components/icons";
import { Tooltip } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogTitle } from "@/components/ui/dialog";

/**
 * A "?" icon next to a page's H1 that opens a popup explaining what the page
 * is for and how it behaves for each role — the replacement for the old
 * one-line description under the title. `children` is the dialog body: use
 * HelpSection for each role/topic block.
 */
export function HelpDialog({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip label="Help">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Help: ${title}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <IconHelpCircle className="h-4 w-4" />
        </button>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg" className="max-h-[80dvh]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-4">{children}</DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One labeled block inside a HelpDialog — a role (e.g. "Department Admins") or a topic (e.g. "How to use this page"). */
export function HelpSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-sm font-semibold">{heading}</h3>
      <div className="flex flex-col gap-1.5 text-sm text-muted-foreground [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
