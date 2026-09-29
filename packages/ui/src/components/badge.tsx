import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../cn";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-transparent bg-muted text-muted-foreground",
        outline: "border-border text-muted-foreground",
        accent: "border-transparent bg-primary/15 text-primary",
        critical: "border-sev-critical/30 bg-sev-critical/12 text-sev-critical",
        high: "border-sev-high/30 bg-sev-high/12 text-sev-high",
        medium: "border-sev-medium/30 bg-sev-medium/12 text-sev-medium",
        low: "border-sev-low/30 bg-sev-low/12 text-sev-low",
        info: "border-border bg-muted/60 text-muted-foreground",
        success: "border-ok/30 bg-ok/12 text-ok",
        warning: "border-sev-medium/30 bg-sev-medium/12 text-sev-medium",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
