import "server-only";

import { cookies, headers } from "next/headers";

import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from ".";

/** An explicit choice (cookie) wins; otherwise follow the browser's language preference. */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(value)) return value;
  return negotiateLocale((await headers()).get("accept-language"));
}
