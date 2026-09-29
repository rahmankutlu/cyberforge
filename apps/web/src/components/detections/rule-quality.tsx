import type { RuleQuality, RuleTests } from "@cyberforge/types";
import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from "@cyberforge/ui";
import { CheckCircle2, XCircle } from "lucide-react";

import { CodeBlock } from "@/components/code-block";

export function QualityBadge({ quality }: { quality: RuleQuality | undefined }) {
  if (!quality) return <span className="text-muted-foreground">—</span>;
  const perfect = quality.passed === quality.total;
  return (
    <Badge
      variant={perfect ? "success" : "warning"}
      className="tabular-nums"
      title={`${quality.passed} of ${quality.total} quality checks passed`}
    >
      {quality.passed}/{quality.total}
    </Badge>
  );
}

/** The seven deterministic checks. Every line is a yes/no fact about the repository content. */
export function QualityCard({ quality }: { quality: RuleQuality }) {
  return (
    <Card data-testid="quality-card">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Detection quality</span>
          <span className="text-xs font-normal text-muted-foreground" data-testid="quality-score">
            {quality.passed} / {quality.total} checks passed
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5">
          {quality.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-[13px]" data-check={c.id} data-passed={c.passed}>
              {c.passed ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 size-4 shrink-0 text-sev-medium" aria-hidden />
              )}
              <span>
                <span className="sr-only">{c.passed ? "Passed: " : "Not passed: "}</span>
                {c.label}
                {c.detail ? <span className="block text-[11px] text-muted-foreground">{c.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Deterministic checks calculated from the rule and its tests, not a score.
        </p>
      </CardContent>
    </Card>
  );
}

export function RuleTestsCard({ tests }: { tests: RuleTests }) {
  const failing = tests.cases.filter((c) => !c.passed).length;
  return (
    <Card data-testid="rule-tests">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Tests</span>
          <span className="text-xs font-normal text-muted-foreground">
            {tests.cases.length === 0
              ? "none yet"
              : failing
                ? `${failing} of ${tests.cases.length} failing`
                : `${tests.cases.length} passing`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tests.errors.map((e) => (
          <p key={e} className="rounded-md border border-sev-critical/30 bg-sev-critical/8 p-2 text-xs">
            {e}
          </p>
        ))}
        {tests.cases.length ? (
          <ul className="space-y-1.5">
            {tests.cases.map((c) => (
              <li key={c.name} className="flex items-start gap-2 text-[13px]" data-passed={c.passed}>
                {c.passed ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 size-4 shrink-0 text-sev-critical" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="sr-only">{c.passed ? "Passing: " : "Failing: "}</span>
                  {c.name}
                  <Badge variant="outline" className={cn("ml-2 align-middle")}>
                    {c.expected ? "must match" : "must not match"}
                  </Badge>
                  {c.message ? <span className="block text-[11px] text-sev-critical">{c.message}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            This rule has no tests yet. Add <code className="font-mono">{tests.slug}.tests.yml</code> beside it: see
            docs/testing-detections.md.
          </p>
        )}
        {tests.source ? (
          <details>
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
              Show {tests.tests_path?.split("/").pop()}
            </summary>
            <CodeBlock code={tests.source} title="tests.yml" maxHeight="24rem" className="mt-2" />
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
