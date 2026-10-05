"use client";

import { TooltipProvider } from "@cyberforge/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import { CommandPalette } from "@/components/shell/command-palette";
import { KeyboardShortcuts } from "@/components/shell/keyboard-shortcuts";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import type { Locale } from "@/lib/i18n";

export function Providers({ children, locale }: { children: ReactNode; locale: Locale }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <LocaleProvider locale={locale}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={200}>
            {children}
            <CommandPalette />
            <KeyboardShortcuts />
            <Toaster
              position="bottom-right"
              theme="system"
              toastOptions={{
                classNames: {
                  toast: "!bg-popover !text-popover-foreground !border-border !text-[13px]",
                  description: "!text-muted-foreground",
                },
              }}
            />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </LocaleProvider>
  );
}
