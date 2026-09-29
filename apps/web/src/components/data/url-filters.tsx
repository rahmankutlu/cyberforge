"use client";

import { Button, Input, NativeSelect, cn } from "@cyberforge/ui";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { readStorage, writeStorage } from "@/lib/persistent-storage";
import { hrefWith, toggleValue } from "@/lib/params";

type Updates = Record<string, string | number | readonly string[] | null | undefined>;

/** URL-driven filter state. Updating a filter resets pagination and never scrolls the page. */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = useCallback(
    (updates: Updates) => {
      const href = hrefWith(pathname, params.toString(), updates);
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [params, pathname, router],
  );

  return { params, set, pending, pathname };
}

/**
 * Remembers the last filter set per list page in localStorage and restores it when you come back
 * to the bare URL. Clearing filters clears the memory as well.
 */
export function PersistFilters({ storageKey }: { storageKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const key = `cyberforge:filters:${storageKey}`;
  const initialised = useRef(false);
  const query = params.toString();

  useEffect(() => {
    if (!initialised.current) {
      initialised.current = true;
      if (!query) {
        const saved = readStorage(key);
        if (saved) router.replace(`${pathname}?${saved}`, { scroll: false });
      } else {
        writeStorage(key, query);
      }
      return;
    }
    writeStorage(key, query || null);
  }, [key, pathname, query, router]);

  return null;
}

export function UrlSearch({
  placeholder = "Search…",
  param = "q",
  className,
  label = "Search",
}: {
  placeholder?: string;
  param?: string;
  className?: string;
  label?: string;
}) {
  const { params, set } = useUrlParams();
  const current = params.get(param) ?? "";
  const timer = useRef<number | null>(null);
  const [value, setValue] = useState(current);
  const [seen, setSeen] = useState(current);

  // Keep the box in sync when the URL changes elsewhere (e.g. "Clear filters").
  if (current !== seen) {
    setSeen(current);
    setValue(current);
  }

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const push = (text: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => set({ [param]: text.trim() || null }), 300);
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          push(e.target.value);
        }}
        className="pl-8"
      />
    </div>
  );
}

export function UrlSelect({
  param,
  label,
  options,
  allLabel = "All",
  className,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  const { params, set } = useUrlParams();
  return (
    <NativeSelect
      aria-label={label}
      value={params.get(param) ?? ""}
      onChange={(e) => set({ [param]: e.target.value || null })}
      className={className}
    >
      <option value="">{`${label}: ${allLabel}`}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </NativeSelect>
  );
}

/** A group of toggle chips bound to a repeated query parameter (e.g. `?severity=high&severity=critical`). */
export function UrlChips({
  param,
  label,
  options,
  colorClasses,
}: {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  /** Extra classes for a selected chip, keyed by option value. Must be serialisable (server -> client). */
  colorClasses?: Record<string, string>;
}) {
  const { params, set } = useUrlParams();
  const selected = params.getAll(param);

  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => set({ [param]: toggleValue(selected, o.value) })}
            className={cn(
              "h-6 rounded-md border px-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on
                ? cn("border-primary/50 bg-primary/12 text-foreground", colorClasses?.[o.value])
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ClearFilters({ keys, storageKey }: { keys: string[]; storageKey?: string }) {
  const { params, set, pending } = useUrlParams();
  const active = keys.some((k) => params.has(k));
  if (!active)
    return pending ? <span className="text-xs text-muted-foreground">Updating…</span> : null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        if (storageKey) writeStorage(`cyberforge:filters:${storageKey}`, null);
        set(Object.fromEntries(keys.map((k) => [k, null])));
      }}
    >
      <X /> Clear filters
    </Button>
  );
}
