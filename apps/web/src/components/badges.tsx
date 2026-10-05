"use client";

import type {
  AlertStatus,
  Difficulty,
  InvestigationStatus,
  RuleFormat,
  Severity,
} from "@cyberforge/types";
import { Badge, cn } from "@cyberforge/ui";
import { FlaskConical } from "lucide-react";
import Link from "next/link";

import { useLocale } from "@/components/i18n/locale-provider";

const SEVERITY_VARIANT = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  informational: "info",
} as const;

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const { t } = useLocale();
  const labels: Record<Severity, ReturnType<typeof t>> = {
    critical: t("severity.critical"),
    high: t("severity.high"),
    medium: t("severity.medium"),
    low: t("severity.low"),
    informational: t("severity.informational"),
  };
  return (
    <Badge variant={SEVERITY_VARIANT[severity]} className={className} data-severity={severity}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {labels[severity]}
    </Badge>
  );
}

const STATUS_VARIANT = {
  new: "accent",
  investigating: "warning",
  contained: "outline",
  resolved: "success",
  false_positive: "neutral",
} as const;

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const { t } = useLocale();
  const labels: Record<AlertStatus, string> = {
    new: t("alertStatus.new"),
    investigating: t("alertStatus.investigating"),
    contained: t("alertStatus.contained"),
    resolved: t("alertStatus.resolved"),
    false_positive: t("alertStatus.falsePositive"),
  };
  return <Badge variant={STATUS_VARIANT[status]}>{labels[status]}</Badge>;
}

const INV_VARIANT = {
  open: "accent",
  in_progress: "warning",
  contained: "outline",
  closed: "success",
} as const;

export function InvestigationStatusBadge({ status }: { status: InvestigationStatus }) {
  const { t } = useLocale();
  const labels: Record<InvestigationStatus, string> = {
    open: t("investigationStatus.open"),
    in_progress: t("investigationStatus.inProgress"),
    contained: t("investigationStatus.contained"),
    closed: t("investigationStatus.closed"),
  };
  return <Badge variant={INV_VARIANT[status]}>{labels[status]}</Badge>;
}

const DIFFICULTY_VARIANT = {
  beginner: "success",
  intermediate: "warning",
  advanced: "high",
} as const;

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const { t } = useLocale();
  const labels: Record<Difficulty, string> = {
    beginner: t("difficulty.beginner"),
    intermediate: t("difficulty.intermediate"),
    advanced: t("difficulty.advanced"),
  };
  return <Badge variant={DIFFICULTY_VARIANT[difficulty]}>{labels[difficulty]}</Badge>;
}

export function FormatBadge({ format }: { format: RuleFormat }) {
  return (
    <Badge variant="outline" className="font-mono uppercase">
      {format}
    </Badge>
  );
}

export function SyntheticBadge({ className }: { className?: string }) {
  const { t } = useLocale();
  return (
    <Badge variant="outline" className={cn("gap-1", className)} title={t("badge.syntheticTitle")}>
      <FlaskConical className="size-3" />
      {t("badge.synthetic")}
    </Badge>
  );
}

export function TechniqueChip({
  id,
  name,
  className,
}: {
  id: string;
  name?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/mitre/${id}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      title={name ? `${id} ${name}` : id}
    >
      <Badge
        variant="outline"
        className="font-mono transition-colors hover:border-primary/50 hover:text-primary"
      >
        {id}
      </Badge>
      {name ? <span className="truncate text-xs text-muted-foreground">{name}</span> : null}
    </Link>
  );
}
