"use client";

import { Button, cn } from "@cyberforge/ui";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function CopyButton({
  text,
  className,
  label = "Copy",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className={className}
      aria-label={`${label} to clipboard`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy to the clipboard");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied" : label}
    </Button>
  );
}

export function CodeBlock({
  code,
  title,
  language,
  className,
  maxHeight = "28rem",
  highlightLines,
  wrap = false,
}: {
  code: string;
  title?: string;
  language?: string;
  className?: string;
  maxHeight?: string;
  /** Lines (1-based) to emphasise, e.g. the lines of a Sigma rule that matched. */
  highlightLines?: ReadonlySet<number>;
  /** Soft-wrap long lines (queries, single-line logs) instead of scrolling horizontally. */
  wrap?: boolean;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-muted/40", className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {title ?? language ?? "code"}
        </span>
        <CopyButton text={code} />
      </div>
      <pre
        className={cn(
          "overflow-auto p-0 font-mono text-xs leading-5",
          wrap && "whitespace-pre-wrap break-all",
        )}
        style={{ maxHeight }}
        tabIndex={0}
      >
        <code className={cn("block py-2", !wrap && "min-w-max")}>
          {lines.map((line, i) => (
            <span
              key={i}
              className={cn(
                "block px-3",
                highlightLines?.has(i + 1) && "bg-primary/12 shadow-[inset_2px_0_0_var(--primary)]",
              )}
            >
              <span
                aria-hidden
                className="mr-3 inline-block w-6 select-none text-right text-muted-foreground"
              >
                {i + 1}
              </span>
              {line || " "}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
