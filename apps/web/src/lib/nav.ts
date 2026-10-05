import {
  Activity,
  BookOpen,
  BookOpenCheck,
  Brain,
  Crosshair,
  FlaskConical,
  GraduationCap,
  Grid3x3,
  LayoutDashboard,
  Library,
  MonitorPlay,
  Radar,
  Search,
  Settings,
  ShieldAlert,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { translate, type Locale } from "@/lib/i18n";
import type { MessageKey } from "@/lib/i18n/messages";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Two-key "go to" shortcut, e.g. `g d`. */
  shortcut?: string;
  keywords?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, shortcut: "d" },
      {
        label: "Live demo",
        href: "/demo",
        icon: MonitorPlay,
        keywords: "showcase simulate playback presentation",
      },
      {
        label: "Lifecycle",
        href: "/lifecycle",
        icon: Workflow,
        shortcut: "l",
        keywords: "attack log detection flow",
      },
    ],
  },
  {
    label: "Cyber Range",
    items: [
      {
        label: "Labs",
        href: "/labs",
        icon: FlaskConical,
        shortcut: "b",
        keywords: "range simulation",
      },
      {
        label: "Stories",
        href: "/stories",
        icon: BookOpenCheck,
        keywords: "incident narrative attack defense investigation timeline",
      },
      {
        label: "AI Security",
        href: "/ai-security",
        icon: Brain,
        shortcut: "a",
        keywords: "llm prompt injection agents",
      },
    ],
  },
  {
    label: "Mini SOC",
    items: [
      {
        label: "Alerts",
        href: "/soc/alerts",
        icon: ShieldAlert,
        shortcut: "s",
        keywords: "queue triage",
      },
      {
        label: "Events",
        href: "/soc/events",
        icon: Activity,
        shortcut: "e",
        keywords: "telemetry logs",
      },
      {
        label: "Investigations",
        href: "/soc/investigations",
        icon: Radar,
        shortcut: "i",
        keywords: "incidents cases",
      },
      {
        label: "Threat Intel",
        href: "/threat-intel",
        icon: Search,
        shortcut: "t",
        keywords: "indicators ioc",
      },
    ],
  },
  {
    label: "Engineering",
    items: [
      {
        label: "Detections",
        href: "/detections",
        icon: Crosshair,
        shortcut: "r",
        keywords: "sigma yara suricata rules",
      },
      {
        label: "Playground",
        href: "/detections/playground",
        icon: FlaskConical,
        keywords: "sigma translate validate test",
      },
      {
        label: "MITRE ATT&CK",
        href: "/mitre",
        icon: Grid3x3,
        shortcut: "m",
        keywords: "coverage matrix techniques",
      },
    ],
  },
  {
    label: "Learn",
    items: [
      {
        label: "Learning tracks",
        href: "/learn",
        icon: GraduationCap,
        shortcut: "n",
        keywords: "courses",
      },
      {
        label: "30 Days of CyberForge",
        href: "/learn/30-days",
        icon: BookOpen,
        keywords: "plan daily",
      },
      {
        label: "Documentation",
        href: "/docs",
        icon: Library,
        shortcut: "o",
        keywords: "docs help",
      },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [
  { label: "Settings", href: "/settings", icon: Settings, shortcut: "," },
];

export const ALL_NAV: NavItem[] = [...NAV.flatMap((g) => g.items), ...FOOTER_NAV];

const GROUP_KEYS: Record<string, MessageKey> = {
  Overview: "nav.overview",
  "Cyber Range": "nav.cyberRange",
  "Mini SOC": "nav.miniSoc",
  Engineering: "nav.engineering",
  Learn: "nav.learn",
};

const ITEM_KEYS: Record<string, MessageKey> = {
  "/": "nav.dashboard",
  "/demo": "nav.liveDemo",
  "/lifecycle": "nav.lifecycle",
  "/labs": "nav.labs",
  "/stories": "nav.stories",
  "/ai-security": "nav.aiSecurity",
  "/soc/alerts": "nav.alerts",
  "/soc/events": "nav.events",
  "/soc/investigations": "nav.investigations",
  "/threat-intel": "nav.threatIntel",
  "/detections": "nav.detections",
  "/detections/playground": "nav.playground",
  "/mitre": "nav.mitre",
  "/learn": "nav.learningTracks",
  "/learn/30-days": "nav.thirtyDays",
  "/docs": "nav.documentation",
  "/settings": "nav.settings",
};

function localizeItem(item: NavItem, locale: Locale): NavItem {
  const key = ITEM_KEYS[item.href];
  return key ? { ...item, label: translate(locale, key) } : item;
}

export function getNavigation(locale: Locale): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    label: translate(locale, GROUP_KEYS[group.label]),
    items: group.items.map((item) => localizeItem(item, locale)),
  }));
}

export function getFooterNavigation(locale: Locale): NavItem[] {
  return FOOTER_NAV.map((item) => localizeItem(item, locale));
}

export function getAllNavigation(locale: Locale): NavItem[] {
  return [...getNavigation(locale).flatMap((group) => group.items), ...getFooterNavigation(locale)];
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/detections")
    return pathname === "/detections" || /^\/detections\/(?!playground)/.test(pathname);
  if (href === "/learn")
    return (
      pathname === "/learn" ||
      (pathname.startsWith("/learn/") && !pathname.startsWith("/learn/30-days"))
    );
  return pathname === href || pathname.startsWith(`${href}/`);
}
