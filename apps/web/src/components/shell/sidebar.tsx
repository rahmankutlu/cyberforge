"use client";

import { cn } from "@cyberforge/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Brand } from "@/components/brand";
import { useLocale } from "@/components/i18n/locale-provider";
import { getFooterNavigation, getNavigation, isActive } from "@/lib/nav";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { locale, t } = useLocale();
  const navigation = getNavigation(locale);

  return (
    <nav
      aria-label={t("nav.primary")}
      className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-3"
    >
      {navigation.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-muted font-medium text-foreground",
                )}
              >
                <item.icon className={cn("size-4 shrink-0", active && "text-primary")} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function SidebarFooter({
  version,
  onNavigate,
}: {
  version?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { locale, t } = useLocale();
  const footerNavigation = getFooterNavigation(locale);
  return (
    <div className="border-t border-border p-2">
      {footerNavigation.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            isActive(pathname, item.href) && "bg-muted text-foreground",
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
      <p className="px-2 pt-2 text-[10px] text-muted-foreground">
        v{version ?? "0.2.0"} · MIT · {t("shell.localFirst")}
      </p>
    </div>
  );
}

export function Sidebar({ version }: { version?: string }) {
  const { t } = useLocale();
  return (
    <aside className="hidden w-58 shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
      <Link
        href="/"
        className="flex h-13 items-center border-b border-border px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("shell.home")}
      >
        <Brand />
      </Link>
      <SidebarNav />
      <SidebarFooter version={version} />
    </aside>
  );
}
