import type { RuntimeSettings } from "@cyberforge/types";
import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { apiGet } from "@/lib/api";
import { createTranslator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

import "./globals.css";

// Pages read live data from the API, so nothing is prerendered at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return {
    title: { default: t("meta.title"), template: "%s · CyberForge" },
    description: t("meta.description"),
    applicationName: "CyberForge",
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f9fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c10" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The shell must render even when the API is down, so pages can show a helpful error state.
  const runtime = await apiGet<RuntimeSettings>("/settings/runtime").catch(() => null);
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <Providers locale={locale}>
          <AppShell
            demoMode={runtime?.demo_mode ?? null}
            version={runtime?.version}
            locale={locale}
          >
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
