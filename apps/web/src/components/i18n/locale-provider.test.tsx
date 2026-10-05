import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LanguageSwitcher } from "./language-switcher";
import { LocaleProvider } from "./locale-provider";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  document.cookie = "cyberforge_locale=; Path=/; Max-Age=0";
  document.documentElement.lang = "en";
  refresh.mockClear();
});

describe("LocaleProvider", () => {
  it("persists a language change and updates the document before refreshing server content", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider locale="en">
        <LanguageSwitcher />
      </LocaleProvider>,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Language" }), "tr");

    expect(document.cookie).toContain("cyberforge_locale=tr");
    expect(document.documentElement.lang).toBe("tr");
    expect(screen.getByRole("combobox", { name: "Dil" })).toHaveValue("tr");
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  });
});
