import type { CopyTranslate } from "@/lib/i18n/copy";

/**
 * The API sends a few notes as English prose. Static ones are matched exactly and the two that name a
 * pipeline or a log source are matched by shape, so each can be shown as one translated sentence.
 * Anything unrecognised is shown as received.
 *
 * The English templates live in `apps/api/cyberforge/services/sigma_service.py`; the Vitest
 * suite pins the strings so a change there fails here instead of silently going untranslated.
 */
export function localizeTranslationNote(note: string, c: CopyTranslate): string {
  switch (note) {
    case "Field names are passed through unchanged. Choose a processing pipeline (ECS, Splunk, ASIM, ...) to map them to your platform's schema before running this against production data.":
    case "Illustrative representation for review and teaching; function names such as REGEXP_LIKE and CIDR_MATCH vary by engine.":
      return c(note);
  }
  const mapped =
    /^Field names follow the (.+) schema\. Check them against your own data source before running this in production\.$/.exec(
      note,
    );
  if (mapped) {
    return c(
      "Field names follow the {{pipeline}} schema. Check them against your own data source before running this in production.",
      { pipeline: mapped[1] ?? "" },
    );
  }
  const none =
    /^No (.+) pipeline changes this rule's fields \((.+)\), so field names are passed through unchanged\.$/.exec(
      note,
    );
  if (none) {
    return c(
      "No {{pipeline}} pipeline changes this rule's fields ({{logsource}}), so field names are passed through unchanged.",
      { pipeline: none[1] ?? "", logsource: none[2] ?? "" },
    );
  }
  return note;
}
