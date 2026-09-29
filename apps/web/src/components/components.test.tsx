import type { AlertSummary } from "@cyberforge/types";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { alertSummary } from "@/test/fixtures";

import { SeverityBadge, TechniqueChip } from "./badges";
import { AlertsTable } from "./soc/alerts-table";
import { Pagination, pageWindow } from "./data/pagination";
import { PersistFilters, UrlChips } from "./data/url-filters";
import { Markdown, resolveDocHref } from "./markdown";
import { progressFor, useLearningProgress } from "@/lib/learning-progress";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/soc/alerts",
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  replace.mockClear();
  search = "";
});

describe("badges", () => {
  it("renders severity with an accessible label and data attribute", () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText("Critical").closest("[data-severity]")).toHaveAttribute(
      "data-severity",
      "critical",
    );
  });

  it("links MITRE technique chips to the explorer", () => {
    render(<TechniqueChip id="T1059.001" name="PowerShell" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/mitre/T1059.001");
  });
});

describe("AlertsTable", () => {
  const critical: AlertSummary = {
    ...alertSummary,
    id: 8,
    severity: "critical",
    title: "Cloud Root Account Console Login",
    status: "investigating",
    assignee: { id: 1, handle: "nv", name: "Nadia Vasquez", role: "Tier 2" },
  };

  it("renders a row per alert with links, status and assignee", () => {
    render(<AlertsTable alerts={[alertSummary, critical]} />);
    expect(screen.getAllByTestId("alert-row")).toHaveLength(2);
    expect(screen.getByRole("link", { name: alertSummary.title })).toHaveAttribute(
      "href",
      "/soc/alerts/7",
    );
    expect(screen.getByText("Investigating")).toBeInTheDocument();
    expect(screen.getByText("Nadia Vasquez")).toBeInTheDocument();
    expect(screen.getByText("Unassigned")).toBeInTheDocument();
  });

  it("makes headers sortable links that keep the current filters", () => {
    render(
      <AlertsTable
        alerts={[alertSummary]}
        sorting={{
          path: "/soc/alerts",
          params: { severity: ["high"] },
          sort: "timestamp",
          order: "desc",
        }}
      />,
    );
    const severity = screen.getByRole("link", { name: /severity/i });
    expect(severity).toHaveAttribute("href", "/soc/alerts?severity=high&sort=severity&order=asc");
    const when = screen.getByRole("link", { name: /when/i });
    expect(when).toHaveAttribute("href", "/soc/alerts?severity=high&sort=timestamp&order=asc");
    expect(screen.getByRole("columnheader", { name: /when/i })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("shows an empty state instead of an empty table", () => {
    render(<AlertsTable alerts={[]} />);
    expect(screen.getByText("No alerts match")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("Pagination", () => {
  it("windows long page lists with gaps", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(10, 20)).toEqual([1, "gap", 8, 9, 10, 11, 12, "gap", 20]);
  });

  it("describes the range and links to neighbouring pages", () => {
    render(
      <Pagination
        page={2}
        pages={3}
        total={45}
        pageSize={20}
        path="/soc/alerts"
        params={{ q: "ssh" }}
        noun="alerts"
      />,
    );
    expect(screen.getByText("21–40 of 45 alerts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute(
      "href",
      "/soc/alerts?q=ssh",
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/soc/alerts?q=ssh&page=3",
    );
    expect(screen.getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page");
  });
});

describe("filters in the URL", () => {
  it("toggles severity chips as repeated query parameters", async () => {
    search = "severity=high";
    const user = userEvent.setup();
    render(
      <UrlChips
        param="severity"
        label="Severity"
        options={[
          { value: "high", label: "High" },
          { value: "critical", label: "Critical" },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "High" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Critical" }));
    expect(replace).toHaveBeenCalledWith("/soc/alerts?severity=high&severity=critical", {
      scroll: false,
    });
    await user.click(screen.getByRole("button", { name: "High" }));
    expect(replace).toHaveBeenLastCalledWith("/soc/alerts", { scroll: false });
  });

  it("remembers filters and restores them when you return to the bare URL", () => {
    search = "severity=critical&page=2";
    const { unmount } = render(<PersistFilters storageKey="alerts" />);
    expect(window.localStorage.getItem("cyberforge:filters:alerts")).toBe(
      "severity=critical&page=2",
    );
    unmount();

    search = "";
    render(<PersistFilters storageKey="alerts" />);
    expect(replace).toHaveBeenCalledWith("/soc/alerts?severity=critical&page=2", { scroll: false });
  });

  it("does not restore anything when no filters were saved", () => {
    render(<PersistFilters storageKey="events" />);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("Markdown", () => {
  it("maps repository doc links to in-app docs pages", () => {
    expect(resolveDocHref("../docs/labs.md")).toEqual({ href: "/docs/labs", external: false });
    expect(resolveDocHref("security-model.md#network")).toEqual({
      href: "/docs/security-model#network",
      external: false,
    });
    expect(resolveDocHref("https://attack.mitre.org/")).toEqual({
      href: "https://attack.mitre.org/",
      external: true,
    });
  });

  it("never renders raw HTML or images from documentation", () => {
    const { container } = render(
      <Markdown>
        {
          "# Title\n\n<script>alert(1)</script>\n\n![x](https://evil.example/x.png)\n\n[docs](https://example.com)"
        }
      </Markdown>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("learning progress (local, no account)", () => {
  it("persists completion in localStorage and survives a remount", () => {
    const first = renderHook(() => useLearningProgress());
    act(() => first.result.current.toggle("day-01"));
    act(() => first.result.current.toggle("day-02"));
    act(() => first.result.current.toggle("day-01")); // undo
    expect(first.result.current.completed).toEqual(["day-02"]);
    expect(
      JSON.parse(window.localStorage.getItem("cyberforge:learning:completed") ?? "[]"),
    ).toEqual(["day-02"]);
    first.unmount();

    const second = renderHook(() => useLearningProgress());
    expect(second.result.current.isDone("day-02")).toBe(true);
    expect(second.result.current.isDone("day-01")).toBe(false);
  });

  it("computes per-track progress", () => {
    expect(progressFor(["a", "c"], ["a", "b", "c", "d"])).toEqual({ done: 2, total: 4, pct: 50 });
    expect(progressFor([], [])).toEqual({ done: 0, total: 0, pct: 0 });
  });

  it("tolerates unavailable or corrupted storage", () => {
    window.localStorage.setItem("cyberforge:learning:completed", "{not json");
    const { result } = renderHook(() => useLearningProgress());
    expect(result.current.completed).toEqual([]);
  });
});
