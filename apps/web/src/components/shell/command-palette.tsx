"use client";

import { Badge, Dialog, DialogContent, DialogDescription, DialogTitle, Kbd } from "@cyberforge/ui";
import type { SearchHit } from "@cyberforge/types";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import {
  BookOpen,
  BookOpenCheck,
  Crosshair,
  Database,
  FileText,
  FlaskConical,
  GraduationCap,
  Grid3x3,
  Moon,
  ShieldAlert,
  Sun,
  Target,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { apiGet } from "@/lib/api";
import { ALL_NAV } from "@/lib/nav";

export const OPEN_PALETTE_EVENT = "cyberforge:open-palette";

const KIND_META: Record<SearchHit["kind"], { label: string; icon: LucideIcon }> = {
  lab: { label: "Labs", icon: FlaskConical },
  story: { label: "Attack stories", icon: BookOpenCheck },
  rule: { label: "Detection rules", icon: Crosshair },
  dataset: { label: "Detection datasets", icon: Database },
  technique: { label: "MITRE techniques", icon: Grid3x3 },
  alert: { label: "Alerts", icon: ShieldAlert },
  doc: { label: "Documentation", icon: FileText },
  learning: { label: "Learning modules", icon: GraduationCap },
  indicator: { label: "Indicators", icon: Target },
};
const KIND_ORDER: SearchHit["kind"][] = [
  "lab",
  "story",
  "rule",
  "dataset",
  "technique",
  "alert",
  "learning",
  "doc",
  "indicator",
];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function CommandPalette() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 150);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  const search = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => apiGet<{ hits: SearchHit[] }>("/search", { q: debounced }),
    enabled: open && debounced.length >= 2,
    placeholderData: keepPreviousData,
  });

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router],
  );

  const needle = query.trim().toLowerCase();
  const navItems = ALL_NAV.filter(
    (item) => !needle || `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(needle),
  );
  const hits = debounced.length >= 2 ? (search.data?.hits ?? []) : [];
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    items: hits.filter((h) => h.kind === kind),
  })).filter((g) => g.items.length > 0);
  const dark = resolvedTheme !== "light";
  const itemClass =
    "flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-foreground/90 outline-none data-[selected=true]:bg-muted data-[selected=true]:text-foreground";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <DialogContent hideClose className="top-[10vh] max-w-xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search CyberForge or jump to a page.
        </DialogDescription>
        <Command shouldFilter={false} label="Command palette" loop>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
            placeholder="Search labs, rules, techniques, alerts, docs…"
            className="h-11 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-8 text-center text-xs text-muted-foreground">
              {search.isFetching ? "Searching…" : "No results."}
            </Command.Empty>

            {grouped.map(({ kind, items }) => {
              const meta = KIND_META[kind];
              return (
                <Command.Group
                  key={kind}
                  heading={meta.label}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {items.map((hit) => (
                    <Command.Item
                      key={`${hit.kind}:${hit.id}`}
                      value={`${hit.kind}:${hit.id}`}
                      onSelect={() => go(hit.href)}
                      className={itemClass}
                    >
                      <meta.icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{hit.title}</span>
                        {hit.subtitle ? (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {hit.badge ? <Badge variant="outline">{hit.badge}</Badge> : null}
                    </Command.Item>
                  ))}
                </Command.Group>
              );
            })}

            {navItems.length > 0 ? (
              <Command.Group
                heading="Go to"
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {navItems.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={`nav:${item.href}`}
                    onSelect={() => go(item.href)}
                    className={itemClass}
                  >
                    <item.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut ? (
                      <span className="flex items-center gap-0.5">
                        <Kbd>g</Kbd>
                        <Kbd>{item.shortcut}</Kbd>
                      </span>
                    ) : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            {!needle || "theme".includes(needle) || "dark light".includes(needle) ? (
              <Command.Group
                heading="Actions"
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                <Command.Item
                  value="action:theme"
                  onSelect={() => {
                    setTheme(dark ? "light" : "dark");
                    setOpen(false);
                  }}
                  className={itemClass}
                >
                  {dark ? (
                    <Sun className="size-4 text-muted-foreground" />
                  ) : (
                    <Moon className="size-4 text-muted-foreground" />
                  )}
                  <span className="flex-1">Switch to {dark ? "light" : "dark"} theme</span>
                </Command.Item>
                <Command.Item
                  value="action:shortcuts"
                  onSelect={() => {
                    setOpen(false);
                    window.dispatchEvent(new Event("cyberforge:show-shortcuts"));
                  }}
                  className={itemClass}
                >
                  <BookOpen className="size-4 text-muted-foreground" />
                  <span className="flex-1">Keyboard shortcuts</span>
                  <Kbd>?</Kbd>
                </Command.Item>
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
