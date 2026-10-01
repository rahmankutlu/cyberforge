import type { AlertStatus, InvestigationStatus, Severity } from "@cyberforge/types";

// All timestamps render in UTC. That is the SOC convention, and it keeps server-rendered and
// client-rendered output identical (no hydration mismatches from differing time zones).
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const dateTimeFull = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const dateOnly = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const timeOnly = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

export const formatDateTime = (iso: string) => `${dateTime.format(new Date(iso))} UTC`;
export const formatDateTimeFull = (iso: string) => `${dateTimeFull.format(new Date(iso))} UTC`;
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));
export const formatTime = (iso: string) => `${timeOnly.format(new Date(iso))}`;

export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  const abs = Math.abs(seconds);
  const suffix = seconds >= 0 ? "ago" : "from now";
  if (abs < 45) return seconds >= 0 ? "just now" : "in a moment";
  const units: [number, string][] = [
    [60, "m"],
    [3600, "h"],
    [86400, "d"],
    [604800, "w"],
  ];
  let value = abs / 60;
  let unit = "m";
  for (const [size, label] of units) {
    if (abs >= size) {
      value = abs / size;
      unit = label;
    }
  }
  return `${Math.floor(value)}${unit} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const formatNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);

export function titleCase(text: string): string {
  return text.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  informational: "Info",
};

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  informational: 4,
};

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  new: "New",
  investigating: "Investigating",
  contained: "Contained",
  resolved: "Resolved",
  false_positive: "False Positive",
};

export const INVESTIGATION_STATUS_LABEL: Record<InvestigationStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  contained: "Contained",
  closed: "Closed",
};

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_RANK[a] - SEVERITY_RANK[b];
}

export const STORY_DOMAIN_LABEL: Record<string, string> = {
  endpoint: "Endpoint",
  identity: "Identity",
  web: "Web",
  network: "Network",
  cloud: "Cloud",
  "ai-security": "AI security",
};
