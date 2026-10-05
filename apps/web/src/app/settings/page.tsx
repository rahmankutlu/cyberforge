import type { RuntimeSettings } from "@cyberforge/types";
import type { Metadata } from "next";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cyberforge/ui";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { DemoResetButton, LearningProgressActions } from "@/components/settings/settings-actions";
import { apiGet } from "@/lib/api";
import { formatNumber, titleCase } from "@/lib/format";
import { createTranslator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return { title: t("settings.title") };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-[13px]">{children}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const s = await apiGet<RuntimeSettings>("/settings/runtime");
  return (
    <>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{t("settings.languageTitle")}</CardTitle>
          <CardDescription>{t("settings.languageDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              {t("settings.interfaceLanguage")}
            </label>
            <LanguageSwitcher />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.instance")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label={t("settings.version")}>v{s.version}</Row>
              <Row label={t("settings.environment")}>
                <Badge variant={s.env === "production" ? "warning" : "outline"}>{s.env}</Badge>
              </Row>
              <Row label={t("settings.demoMode")}>
                {s.demo_mode ? (
                  <Badge variant="accent">{t("settings.demoOn")}</Badge>
                ) : (
                  <Badge variant="outline">{t("settings.off")}</Badge>
                )}
              </Row>
              <Row label={t("settings.mitreData")}>
                {Object.entries(s.content.mitre)
                  .map(([k, v]) => `${k.toUpperCase()} ${v}`)
                  .join(" · ")}
              </Row>
              <Row label={t("settings.content")}>
                {t("settings.contentSummary", {
                  labs: s.content.labs,
                  rules: s.content.rules,
                  docs: s.content.docs,
                })}
              </Row>
              {Object.entries(s.counts).map(([k, v]) => (
                <Row key={k} label={titleCase(k)}>
                  <span className="tabular-nums">{formatNumber(v, locale)}</span>
                </Row>
              ))}
            </dl>
            {s.demo_mode ? (
              <div className="mt-3">
                <DemoResetButton />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.aiAnalyst")}</CardTitle>
              <CardDescription>{t("settings.aiDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label={t("settings.status")}>
                  {s.ai.enabled ? (
                    <Badge variant="success">{t("settings.enabled")}</Badge>
                  ) : (
                    <Badge variant="outline">{t("settings.notConfigured")}</Badge>
                  )}
                </Row>
                <Row label={t("settings.provider")}>{s.ai.provider}</Row>
                {s.ai.model ? <Row label={t("settings.model")}>{s.ai.model}</Row> : null}
              </dl>
              {s.ai.reason ? (
                <p className="mt-2 text-xs text-muted-foreground">{s.ai.reason}</p>
              ) : null}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {t("settings.aiHelp")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-ok" /> {t("settings.labNetwork")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                {Object.entries(s.lab_network).map(([k, v]) => (
                  <Row key={k} label={titleCase(k)}>
                    {v}
                  </Row>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("settings.learningProgress")}</CardTitle>
              <CardDescription>{t("settings.learningDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <LearningProgressActions />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
