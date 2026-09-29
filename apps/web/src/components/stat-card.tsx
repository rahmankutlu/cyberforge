import { Card, cn } from "@cyberforge/ui";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  tone,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  href?: string;
  tone?: "critical" | "high" | "ok";
  children?: ReactNode;
}) {
  const body = (
    <Card
      className={cn(
        "h-full p-4 transition-colors",
        href && "hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums tracking-tight",
          tone === "critical" && "text-sev-critical",
          tone === "high" && "text-sev-high",
          tone === "ok" && "text-ok",
        )}
      >
        {value}
      </div>
      {hint ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
      {children}
    </Card>
  );
  return href ? (
    <Link
      href={href}
      className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  ) : (
    body
  );
}
