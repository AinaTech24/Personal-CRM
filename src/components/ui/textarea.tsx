"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ValidationTooltip, useFieldValidation } from "@/components/ui/validation-tooltip";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, onInvalid, onChange, onBlur, ...props }, ref) => {
    const v = useFieldValidation<HTMLTextAreaElement>({ onInvalid, onChange, onBlur, forwardedRef: ref });
    return (
      <>
        <textarea
          className={cn(
            "flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            v.error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          ref={v.setRef}
          onInvalid={v.handleInvalid}
          onChange={v.handleChange}
          onBlur={v.handleBlur}
          {...props}
        />
        {v.error && typeof document !== "undefined" && createPortal(<ValidationTooltip {...v.error} />, document.body)}
      </>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
