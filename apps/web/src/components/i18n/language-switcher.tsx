"use client";

import { NativeSelect } from "@cyberforge/ui";

import { useLocale } from "@/components/i18n/locale-provider";
import { isLocale } from "@/lib/i18n";

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <NativeSelect
      value={locale}
      onChange={(event) => {
        if (isLocale(event.target.value)) setLocale(event.target.value);
      }}
      aria-label={t("language.label")}
      title={t("language.label")}
      className={compact ? "w-[5.75rem]" : "w-full"}
    >
      <option value="en">{compact ? "English" : t("language.english")}</option>
      <option value="tr">{t("language.turkish")}</option>
    </NativeSelect>
  );
}
