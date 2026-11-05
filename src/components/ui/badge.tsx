import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        // text-status-*-text, not text-primary/emerald-500/etc directly: those
        // are tuned to read on a near-black OR near-white solid background,
        // not on a light tint of themselves in both themes at once — see the
        // --status-*-text tokens in globals.css for why.
        default: "border-transparent bg-primary/15 text-status-primary-text",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        success: "border-transparent bg-emerald-500/15 text-status-success-text",
        warning: "border-transparent bg-amber-500/15 text-status-warning-text",
        destructive: "border-transparent bg-destructive/15 text-status-destructive-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
