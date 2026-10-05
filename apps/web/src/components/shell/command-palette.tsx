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
import { useLocale } from "@/components/i18n/locale-provider";
import { getAllNavigation } from "@/lib/nav";

export const OPEN_PALETTE_EVENT = "cyberforge:open-palette";

const KIND_META: Record<
  SearchHit["kind"],
  { labelKey: Parameters<ReturnType<typeof useLocale>["t"]>[0]; icon: LucideIcon }
> = {
  lab: { labelKey: "search.kind.labs", icon: FlaskConical },
  story: { labelKey: "search.kind.stories", icon: BookOpenCheck },
  rule: { labelKey: "search.kind.rules", icon: Crosshair },
  dataset: { labelKey: "search.kind.datasets", icon: Database },
  technique: { labelKey: "search.kind.techniques", icon: Grid3x3 },
  alert: { labelKey: "search.kind.alerts", icon: ShieldAlert },
  doc: { labelKey: "search.kind.docs", icon: FileText },
  learning: { labelKey: "search.kind.learning", icon: GraduationCap },
  indicator: { labelKey: "search.kind.indicators", icon: Target },
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
  const { locale, t } = useLocale();
  const allNav = getAllNavigation(locale);
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
  const navItems = allNav.filter(
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
        <DialogTitle className="sr-only">{t("search.palette")}</DialogTitle>
        <DialogDescription className="sr-only">{t("search.description")}</DialogDescription>
        <Command shouldFilter={false} label={t("search.palette")} loop>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
            placeholder={t("search.placeholder")}
            className="h-11 w-full border-b border-border bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-8 text-center text-xs text-muted-foreground">
              {search.isFetching ? t("search.searching") : t("search.noResults")}
            </Command.Empty>

            {grouped.map(({ kind, items }) => {
              const meta = KIND_META[kind];
              return (
                <Command.Group
                  key={kind}
                  heading={t(meta.labelKey)}
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
                heading={t("search.goTo")}
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
                heading={t("search.actions")}
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
                  <span className="flex-1">{dark ? t("theme.light") : t("theme.dark")}</span>
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
                  <span className="flex-1">{t("search.keyboardShortcuts")}</span>
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
