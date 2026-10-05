import type { ReactNode } from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { createTranslator, type Locale } from "@/lib/i18n";

export function AppShell({
  children,
  demoMode,
  version,
  locale,
}: {
  children: ReactNode;
  demoMode: boolean | null;
  version?: string;
  locale: Locale;
}) {
  const t = createTranslator(locale);
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-1.5 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t("shell.skipToContent")}
      </a>
      <Sidebar version={version} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar demoMode={demoMode} version={version} />
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
