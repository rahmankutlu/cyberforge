"use client";

import type { RuleQuality, RuleTests } from "@cyberforge/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from "@cyberforge/ui";
import { CheckCircle2, XCircle } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import { useLocale } from "@/components/i18n/locale-provider";
import { renderRich } from "@/lib/i18n/rich";

export function QualityBadge({ quality }: { quality: RuleQuality | undefined }) {
  const { c } = useLocale();
  if (!quality) return <span className="text-muted-foreground">—</span>;
  const perfect = quality.passed === quality.total;
  return (
    <Badge
      variant={perfect ? "success" : "warning"}
      className="tabular-nums"
      title={c("{{passed}} of {{total}} checks passed", {
        passed: quality.passed,
        total: quality.total,
      })}
    >
      {quality.passed}/{quality.total}
    </Badge>
  );
}

/** The seven deterministic checks. Every line is a yes/no fact about the repository content. */
export function QualityCard({ quality }: { quality: RuleQuality }) {
  const { c } = useLocale();
  return (
    <Card data-testid="quality-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{c("Detection quality")}</span>
          <span className="text-xs font-normal text-muted-foreground" data-testid="quality-score">
            {c("{{passed}} / {{total}} checks passed", {
              passed: quality.passed,
              total: quality.total,
            })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {quality.checks.map((check) => (
            <li
              key={check.id}
              className="flex items-start gap-2 text-[13px]"
              data-check={check.id}
              data-passed={check.passed}
            >
              {check.passed ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-sev-medium" aria-hidden />
              )}
              <span>
                <span className="sr-only">
                  {check.passed ? `${c("Passed:")} ` : `${c("Not passed:")} `}
                </span>
                {check.label}
                {check.detail ? (
                  <span className="block text-[11px] text-muted-foreground">{check.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {c("Deterministic checks calculated from the rule and its tests, not a score.")}
        </p>
      </CardContent>
    </Card>
  );
}

export function RuleTestsCard({ tests }: { tests: RuleTests }) {
  const { c } = useLocale();
  const failing = tests.cases.filter((c) => !c.passed).length;
  return (
    <Card data-testid="rule-tests">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{c("Tests")}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {tests.cases.length === 0
              ? c("none yet")
              : failing
                ? c("{{failing}} of {{total}} failing", { failing, total: tests.cases.length })
                : `${tests.cases.length} ${c("passing")}`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tests.errors.map((e) => (
          <p
            key={e}
            className="rounded-md border border-sev-critical/30 bg-sev-critical/8 p-2 text-xs"
          >
            {e}
          </p>
        ))}
        {tests.cases.length ? (
          <ul className="space-y-1.5">
            {tests.cases.map((test) => (
              <li
                key={test.name}
                className="flex items-start gap-2 text-[13px]"
                data-passed={test.passed}
              >
                {test.passed ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-sev-critical" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="sr-only">
                    {test.passed ? `${c("Passing:")} ` : `${c("Failing:")} `}
                  </span>
                  {test.name}
                  <Badge variant="outline" className={cn("ml-2 align-middle")}>
                    {test.expected ? c("must match") : c("must not match")}
                  </Badge>
                  {test.message ? (
                    <span className="block text-[11px] text-sev-critical">{test.message}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {renderRich(
              c(
                "This rule has no tests yet. Add <code>{{file}}</code> beside it: see docs/testing-detections.md.",
                { file: `${tests.slug}.tests.yml` },
              ),
              { code: (text) => <code className="font-mono">{text}</code> },
            )}
          </p>
        )}
        {tests.source ? (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              {c("Show {{file}}", { file: tests.tests_path?.split("/").pop() ?? "tests.yml" })}
            </summary>
            <CodeBlock code={tests.source} title="tests.yml" maxHeight="24rem" className="mt-2" />
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
