"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { createTranslator, LOCALE_COOKIE, type Locale, type Translate } from "@/lib/i18n";
import { createCopyTranslator, type CopyTranslate } from "@/lib/i18n/copy";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
  c: CopyTranslate;
}

const defaultContext: LocaleContextValue = {
  locale: "en",
  setLocale: () => undefined,
  t: createTranslator("en"),
  c: createCopyTranslator("en"),
};

const LocaleContext = createContext<LocaleContextValue>(defaultContext);

export function LocaleProvider({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      if (nextLocale === locale) return;
      document.cookie = `${LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax`;
      document.documentElement.lang = nextLocale;
      setLocaleState(nextLocale);
      startTransition(() => router.refresh());
    },
    [locale, router],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t: createTranslator(locale), c: createCopyTranslator(locale) }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
