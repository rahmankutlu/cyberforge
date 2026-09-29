"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle, Kbd } from "@cyberforge/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { OPEN_PALETTE_EVENT } from "@/components/shell/command-palette";
import { ALL_NAV } from "@/lib/nav";

const SHOW_EVENT = "cyberforge:show-shortcuts";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** `g` then a letter jumps to a page (Linear/GitHub style); `/` opens search; `?` lists shortcuts. */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onShow = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;

      if (pendingG.current !== null) {
        window.clearTimeout(pendingG.current);
        pendingG.current = null;
        const target = ALL_NAV.find((item) => item.shortcut === e.key.toLowerCase());
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (e.key === "g") {
        pendingG.current = window.setTimeout(() => (pendingG.current = null), 1000);
      } else if (e.key === "/") {
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
      } else if (e.key === "?") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(SHOW_EVENT, onShow);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHOW_EVENT, onShow);
    };
  }, [router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>Shortcuts are disabled while typing in a field.</DialogDescription>
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-[13px]">
          <Row label="Command palette / search" keys={["⌘/Ctrl", "K"]} />
          <Row label="Search" keys={["/"]} />
          <Row label="This help" keys={["?"]} />
          {ALL_NAV.filter((i) => i.shortcut).map((item) => (
            <Row key={item.href} label={`Go to ${item.label}`} keys={["g", item.shortcut!]} />
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, keys }: { label: string; keys: string[] }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center justify-end gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </dd>
    </>
  );
}
