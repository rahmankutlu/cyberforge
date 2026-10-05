# Localization

CyberForge ships in **English** (the source language) and **Turkish** (`tr`). Adding a language, fixing a translation and keeping content translations in step with the English YAML are all designed to be small, checkable changes.

## What is translated

| Layer                  | Where                                          | Keyed by                               | Checked by                                                              |
| ---------------------- | ---------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| Interface messages     | `apps/web/src/lib/i18n/messages.ts`            | A stable key such as `nav.dashboard`   | TypeScript (`satisfies Record<MessageKey, string>`), Vitest             |
| Feature copy           | `apps/web/src/lib/i18n/copy.ts`                | The English sentence itself            | TypeScript (`CopyKey`), Vitest (placeholders, inline tags, terminology) |
| Authored content       | `apps/web/src/lib/i18n/tr-content.json`        | The exact English text from the YAML   | `pnpm i18n:check`, Vitest                                               |
| Domain terminology     | `apps/web/src/lib/i18n/glossary.tr.json`       | A preferred term or a pattern to avoid | Vitest, against every Turkish string above                              |
| Dates, numbers, `lang` | `apps/web/src/lib/format.ts`, `app/layout.tsx` | The active locale                      | Vitest, Playwright                                                      |

Authored content is everything the labs, stories, learning tracks, detections, AI security model, threat intelligence and example incidents say. The English YAML stays canonical: nothing outside `tr-content.json` is translated, and **telemetry, identifiers, code, commands, URLs and raw evidence are never translated**.

Not translated: the Markdown guides under `/docs`, API error messages and the OpenAPI schema. Strings that are not in a catalogue render in English. That is intentional: user-authored text (case titles, notes, imported indicators) must never be rewritten.

## How the language is chosen

1. The `cyberforge_locale` cookie, set by the language switcher (top bar and **Settings**).
2. Otherwise the browser's `Accept-Language` header (`tr-TR` selects Turkish; q-values are honoured).
3. Otherwise English.

Server Components read the locale with `getLocale()`. Client Components use `useLocale()`, which returns `t` (interface messages) and `c` (feature copy).

## Writing translatable code

- **Whole sentences only.** Never build a sentence from fragments (`{c("Showing")} {n} {c("items")}`): Turkish word order and suffixes cannot be assembled from English pieces. Use placeholders: `c("{{count}} of {{total}} items", { count, total })`.
- **Links and emphasis** stay inside the sentence with inline tags, rendered by `renderRich` from `lib/i18n/rich.tsx`:
  `c("Open the <playground>playground</playground>.")`.
- **Plurals:** use `countLabel(c, n, "{{count}} event", "{{count}} events")`. Turkish uses one form after a number, so both keys translate identically.
- **Catalogue content never reaches the browser.** Server Components call `localizeContent` / `localizeContentTree` and pass the result down; Client Components render what they receive. This keeps the catalogue (hundreds of KB) out of the client bundle.
- Format dates and numbers with the helpers in `lib/format.ts`, never with a hard-coded locale.

## Changing English content

```bash
pnpm i18n:check   # lists missing, stale and damaged translations; CI runs it
pnpm i18n:sync    # adds empty entries for new English text and removes stale ones
```

After `sync`, translate each empty entry **by hand**. The tool deliberately has no machine-translation step: automatic translation of security prose produced wrong terms ("agent" as _aracı_, "ticket" as _bilet_, "bucket" as _kova_) that no check can catch.

`check` rejects a translation that changes backtick code, URLs, IP addresses, ATT&CK ids or `{{placeholders}}`, or that loses headings, list items or bold spans from a Markdown entry.

## Turkish style

- Address the reader formally and plainly: _çalıştırın_, _inceleyin_. Imperatives, not "lütfen".
- Sentence case for headings and buttons; Title Case only where the English source is a proper name (lab, story and rule titles).
- Use the circumflex where Turkish spelling does: _hikâye_, _yapay zekâ_.
- Suffixes on names and code follow pronunciation with an apostrophe: _CyberForge'u_, _CyberForge'un_, _SSH'de_, _lsass'ı_.
- Keep product names, protocols and standards in English: Sigma, YARA, Suricata, MITRE ATT&CK, OWASP, JWT, DNS, RDP, SMB, WMI, PowerShell, Docker.
- Keep a term of art that has no settled Turkish form in English (_download cradle_) and record the decision in the glossary.

### Glossary

The machine-readable list is `glossary.tr.json`; the `avoid` patterns fail CI. Core terms:

| English               | Turkish              | English           | Turkish           |
| --------------------- | -------------------- | ----------------- | ----------------- |
| agent (AI)            | ajan                 | lab               | laboratuvar       |
| alert                 | uyarı                | log               | günlük            |
| allow-list            | izin listesi         | mitigation        | önlem             |
| attacker / intruder   | saldırgan            | password spraying | parola püskürtme  |
| blast radius          | etki alanı           | persistence       | kalıcılık         |
| canary token          | kanarya belirteci    | playground        | deneme alanı      |
| container             | konteyner            | port              | port              |
| containment           | sınırlama            | process           | işlem             |
| credential            | kimlik bilgisi       | prompt            | istem             |
| cyber range           | siber tatbikat alanı | prompt injection  | istem enjeksiyonu |
| detection             | tespit               | remediation       | giderme           |
| event / incident      | olay                 | script            | betik             |
| false positive        | yanlış pozitif       | secret            | gizli bilgi       |
| hardening             | sıkılaştırma         | severity          | önem derecesi     |
| host                  | ana bilgisayar       | ticket            | talep             |
| instance (of the app) | kurulum              | web shell         | web kabuğu        |
| investigation         | inceleme             | token             | belirteç          |
| case                  | vaka                 | triage            | önceliklendirme   |

## Adding a language

1. Add the code to `SUPPORTED_LOCALES` in `lib/i18n/index.ts` and its dictionary to `messages.ts`; the compiler lists every key to translate.
2. Add the language's copy map next to `trCopy` in `copy.ts` and a content catalogue next to `tr-content.json`; `scripts/i18n_catalog.py check --catalogue <file>` audits any catalogue.
3. Add the language to `LanguageSwitcher` and `formatDateTime`, `formatDate` and friends in `lib/format.ts`.
4. Add a glossary file and extend `catalogue.test.ts` and `e2e/localization.spec.ts`.

## Reporting a translation problem

Open a **Translation** issue (it asks for the page, the current text and a suggestion), or send a pull request that edits the string and runs `pnpm test:web && pnpm i18n:check`.
