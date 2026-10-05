import type { TranslateResponse, Translation } from "@cyberforge/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as renderUi, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/components/i18n/locale-provider";
import { localizeTranslationNote } from "@/lib/translation-notes";
import { createCopyTranslator } from "@/lib/i18n/copy";

import { TranslationView, translateBody } from "./translation-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const render = (ui: ReactElement) =>
  renderUi(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const base: Translation = {
  target: "elastic",
  label: "Elastic Query",
  language: "Lucene query string",
  queries: ["process.command_line:*enc*"],
  error: null,
  notes: [],
  pipeline: null,
  pipeline_label: null,
  field_changes: [],
  added_fields: [],
  dropped_fields: [],
  pipeline_error: null,
};

const response = (translation: Partial<Translation>): TranslateResponse => ({
  validation: {
    valid: true,
    errors: [],
    warnings: [],
  } as unknown as TranslateResponse["validation"],
  translations: [{ ...base, ...translation }],
});

describe("TranslationView", () => {
  it("shows which pipeline mapped the fields and how each field changed", () => {
    render(
      <TranslationView
        result={response({
          pipeline: "ecs_windows",
          pipeline_label: "ECS (Windows)",
          field_changes: [
            { source: "CommandLine", targets: ["process.command_line"], changed: true },
            { source: "ResponseSize", targets: ["ResponseSize"], changed: false },
          ],
          added_fields: ["winlog.channel"],
          dropped_fields: ["EventID"],
        })}
      />,
    );
    expect(screen.getByTestId("pipeline-badge-elastic")).toHaveTextContent(
      "Mapped with ECS (Windows)",
    );
    const table = within(screen.getByTestId("field-mapping-elastic"));
    expect(table.getByRole("row", { name: /CommandLine process\.command_line/ })).toBeVisible();
    expect(table.getByRole("row", { name: /ResponseSize unchanged/ })).toBeVisible();
    expect(table.getByText(/Added by the pipeline: winlog\.channel/)).toBeVisible();
    expect(table.getByText(/Not carried over by the pipeline: EventID/)).toBeVisible();
  });

  it("says so when a pipeline refused the rule and the query is unmapped", () => {
    render(
      <TranslationView
        result={response({ pipeline_error: "Microsoft Sentinel ASIM: Invalid field ShareName" })}
      />,
    );
    expect(screen.getByTestId("pipeline-badge-elastic")).toHaveTextContent("Field names unchanged");
    expect(screen.getByTestId("pipeline-error-elastic")).toHaveTextContent(
      "The pipeline could not map this rule. The query below is unmapped.",
    );
    expect(screen.getByTestId("pipeline-error-elastic")).toHaveTextContent(
      "Invalid field ShareName",
    );
    expect(screen.queryByTestId("field-mapping-elastic")).not.toBeInTheDocument();
  });

  it("is translated to Turkish, including the notes the API sends in English", () => {
    render(
      <LocaleProvider locale="tr">
        <TranslationView
          result={response({
            pipeline: "ecs_windows",
            pipeline_label: "ECS (Windows)",
            field_changes: [
              { source: "CommandLine", targets: ["process.command_line"], changed: true },
            ],
            notes: [
              "Field names follow the ECS (Windows) schema. Check them against your own data source before running this in production.",
            ],
          })}
        />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("pipeline-badge-elastic")).toHaveTextContent(
      "ECS (Windows) ile eşlendi",
    );
    expect(screen.getByText("Kural alanı")).toBeVisible();
    expect(screen.getByText(/Alan adları ECS \(Windows\) şemasını izler/)).toBeVisible();
  });

  it("asks for the best-fitting pipeline for every SIEM unless told otherwise", () => {
    expect(translateBody("title: x", {}).pipelines).toEqual({
      elastic: "auto",
      splunk: "auto",
      sentinel: "auto",
      opensearch: "auto",
    });
    expect(translateBody("title: x", { sentinel: "microsoft_xdr" }).pipelines.sentinel).toBe(
      "microsoft_xdr",
    );
  });
});

describe("translation notes", () => {
  const c = createCopyTranslator("tr");

  it("translates the two notes that name a pipeline or a log source", () => {
    expect(
      localizeTranslationNote(
        "No ECS (Windows) pipeline changes this rule's fields (linux/process_creation), so field names are passed through unchanged.",
        c,
      ),
    ).toBe(
      "Hiçbir ECS (Windows) işleme hattı bu kuralın alanlarını (linux/process_creation) değiştirmez; bu yüzden alan adları değiştirilmeden aktarılır.",
    );
  });

  it("leaves unrecognised notes alone", () => {
    expect(localizeTranslationNote("Something new from the API.", c)).toBe(
      "Something new from the API.",
    );
  });

  it("stays in step with the sentences the API sends", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../../../../api/cyberforge/services/sigma_service.py"),
      "utf8",
    ).replace(/"\s*\n\s*"/g, "");
    for (const fragment of [
      "Field names are passed through unchanged. Choose a processing pipeline (ECS, Splunk, ASIM, ...) to map them to your platform's schema before running this against production data.",
      "Field names follow the {label} schema. Check them against your own data source before running this in production.",
      "No {label} pipeline changes this rule's fields ({logsource}), so field names are passed through unchanged.",
      "Illustrative representation for review and teaching; function names such as REGEXP_LIKE and CIDR_MATCH vary by engine.",
    ]) {
      expect(source).toContain(fragment);
    }
  });
});
