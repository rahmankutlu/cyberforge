import { enMessages, trMessages, type MessageKey } from "./messages";

export const SUPPORTED_LOCALES = ["en", "tr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type TranslationValues = Record<string, string | number>;
export type Translate = (key: MessageKey, values?: TranslationValues) => string;

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "cyberforge_locale";

const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en: enMessages,
  tr: trMessages,
};

export function isLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

/**
 * Picks the best supported locale for an `Accept-Language` header, honouring q-values and
 * regional subtags ("tr-TR" selects Turkish). Falls back to the default locale.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part, order) => {
      const [tag = "", ...params] = part.trim().split(";");
      const weight = params.find((param) => param.trim().startsWith("q="));
      const q = weight ? Number(weight.trim().slice(2)) : 1;
      return { language: tag.trim().toLowerCase().split("-")[0] ?? "", q, order };
    })
    .filter(({ q }) => Number.isFinite(q) && q > 0)
    .sort((a, b) => b.q - a.q || a.order - b.order);
  return (
    (ranked.find(({ language }) => isLocale(language))?.language as Locale | undefined) ??
    DEFAULT_LOCALE
  );
}

export function translate(locale: Locale, key: MessageKey, values?: TranslationValues): string {
  const template = dictionaries[locale][key] ?? enMessages[key];
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}

export function createTranslator(locale: Locale): Translate {
  return (key, values) => translate(locale, key, values);
}

export type { MessageKey } from "./messages";
