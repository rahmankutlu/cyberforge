import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { countLabel, createCopyTranslator } from "./copy";
import { renderRich } from "./rich";

describe("renderRich", () => {
  const tags = {
    link: (text: string) => <a href="/x">{text}</a>,
    code: (text: string) => <code>{text}</code>,
  };

  it("renders tagged spans in place and keeps surrounding text", () => {
    const { container } = render(
      <p>{renderRich("Open the <link>playground</link> or edit <code>a.yml</code>.", tags)}</p>,
    );
    expect(container.querySelector("a")?.textContent).toBe("playground");
    expect(container.querySelector("code")?.textContent).toBe("a.yml");
    expect(container.textContent).toBe("Open the playground or edit a.yml.");
  });

  it("lets a translation move the tags", () => {
    const { container } = render(
      <p>{renderRich("<code>a.yml</code> dosyasını <link>deneme alanında</link> açın.", tags)}</p>,
    );
    expect(container.textContent).toBe("a.yml dosyasını deneme alanında açın.");
  });

  it("falls back to plain text for unknown tags instead of dropping content", () => {
    const { container } = render(<p>{renderRich("Hello <b>world</b>!", tags)}</p>);
    expect(container.textContent).toBe("Hello world!");
  });
});

describe("countLabel", () => {
  it("picks singular and plural English keys but one Turkish form", () => {
    const en = createCopyTranslator("en");
    const tr = createCopyTranslator("tr");
    expect(countLabel(en, 1, "{{count}} event", "{{count}} events")).toBe("1 event");
    expect(countLabel(en, 3, "{{count}} event", "{{count}} events")).toBe("3 events");
    expect(countLabel(tr, 1, "{{count}} event", "{{count}} events")).toBe("1 olay");
    expect(countLabel(tr, 3, "{{count}} event", "{{count}} events")).toBe("3 olay");
  });
});
