"use client";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Kbd,
} from "@cyberforge/ui";
import { FlaskConical, Menu, Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Brand } from "@/components/brand";
import { SidebarFooter, SidebarNav } from "@/components/shell/sidebar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { OPEN_PALETTE_EVENT } from "@/components/shell/command-palette";

export function Topbar({ demoMode, version }: { demoMode: boolean | null; version?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:px-5">
      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMenuOpen(true)}
        >
          <Menu />
        </Button>
        <DialogContent
          hideClose
          className="left-0 top-0 h-dvh max-w-64 translate-x-0 grid-rows-[auto_1fr_auto] gap-0 rounded-none border-y-0 border-l-0 p-0"
        >
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <DialogDescription className="sr-only">Site navigation</DialogDescription>
          <div className="flex h-13 items-center border-b border-border px-4">
            <Brand />
          </div>
          <div className="flex min-h-0 flex-col overflow-y-auto">
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
          </div>
          <SidebarFooter version={version} onNavigate={() => setMenuOpen(false)} />
        </DialogContent>
      </Dialog>

      <Link href="/" className="flex items-center lg:hidden" aria-label="CyberForge home">
        <Brand />
      </Link>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        className="ml-auto flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-border bg-card/60 px-2.5 text-left text-[13px] text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring lg:ml-0"
        aria-label="Search labs, rules, techniques, alerts and docs"
      >
        <Search className="size-3.5" />
        <span className="flex-1 truncate">Search labs, rules, alerts…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto hidden items-center gap-2 lg:flex">
        {demoMode ? (
          <Badge
            variant="accent"
            title="Telemetry on this instance is synthetic (CYBERFORGE_DEMO_MODE=true)"
          >
            <FlaskConical className="size-3" />
            Demo data
          </Badge>
        ) : null}
      </div>
      <ThemeToggle />
    </header>
  );
}
