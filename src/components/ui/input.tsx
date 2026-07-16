"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ValidationTooltip, useFieldValidation } from "@/components/ui/validation-tooltip";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, onInvalid, onChange, onBlur, ...props }, ref) => {
    const v = useFieldValidation<HTMLInputElement>({ onInvalid, onChange, onBlur, forwardedRef: ref });
    return (
      <>
        <input
          type={type}
          className={cn(
            "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
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
Input.displayName = "Input";

export { Input };
