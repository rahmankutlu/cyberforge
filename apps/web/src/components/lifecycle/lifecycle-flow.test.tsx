import { TooltipProvider } from "@cyberforge/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lifecycle } from "@/test/fixtures";

import { LifecycleFlow, STAGES } from "./lifecycle-flow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/lifecycle",
  useSearchParams: () => new URLSearchParams(),
}));

function wrap(ui: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>
  );
}

describe("LifecycleFlow", () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.useRealTimers());

  it("shows all eight stages in order, each with a summary", () => {
    render(wrap(<LifecycleFlow data={lifecycle} />));
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(8);
    expect(tabs.map((t) => t.getAttribute("data-stage"))).toEqual(STAGES.map((s) => s.key));
    expect(within(tabs[1]!).getByText("1 event")).toBeInTheDocument();
    expect(within(tabs[5]!).getByText("T1059.001")).toBeInTheDocument();
  });

  it("starts on the simulation stage and explains what the lab does", () => {
    render(wrap(<LifecycleFlow data={lifecycle} />));
    expect(screen.getByRole("tab", { name: /simulation/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/Suspicious PowerShell Detection Simulation/)).toBeInTheDocument();
    expect(screen.getByText(/No packets are sent/)).toBeInTheDocument();
  });

  it("highlights the values the rule matched in the raw event", async () => {
    const user = userEvent.setup();
    render(wrap(<LifecycleFlow data={lifecycle} />));
    await user.click(screen.getByRole("tab", { name: /raw event/i }));
    const raw = screen.getByTestId("raw-event");
    const marked = Array.from(raw.querySelectorAll("mark")).map((m) => m.textContent);
    expect(marked.some((t) => t?.includes("powershell.exe"))).toBe(true);
    expect(marked.some((t) => t?.includes("-enc"))).toBe(true);
    expect(screen.getByText(/PowerShell runs hidden/)).toBeInTheDocument();
  });

  it("flags matched fields in the parsed event", async () => {
    const user = userEvent.setup();
    render(wrap(<LifecycleFlow data={lifecycle} />));
    await user.click(screen.getByRole("tab", { name: /parsed event/i }));
    const map = screen.getByTestId("field-map");
    expect(within(map).getAllByText("matched")).toHaveLength(2); // Image and CommandLine, not Computer
  });

  it("shows the rule, why it matched and the trace table", async () => {
    const user = userEvent.setup();
    render(wrap(<LifecycleFlow data={lifecycle} />));
    await user.click(screen.getByRole("tab", { name: /rule match/i }));
    expect(screen.getByTestId("match-explanation")).toHaveTextContent(
      "matched on CommandLine, Image",
    );
    const trace = screen.getByTestId("match-trace");
    expect(within(trace).getByText("*\\powershell.exe")).toBeInTheDocument();
    expect(screen.getByText("Endpoint management agents")).toBeInTheDocument();
  });

  it("walks through MITRE, investigation and mitigation", async () => {
    const user = userEvent.setup();
    render(wrap(<LifecycleFlow data={lifecycle} />));
    await user.click(screen.getByRole("tab", { name: /mitre/i }));
    expect(screen.getByText("Execution")).toBeInTheDocument();
    expect(screen.getByText("Antivirus/Antimalware")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /investigation/i }));
    expect(screen.getByText("Not yet investigated")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create investigation/i })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /mitigation/i }));
    expect(screen.getByText(/Block or restrict Office macros/)).toBeInTheDocument();
    expect(screen.getByText(/Lab guidance/)).toBeInTheDocument();
  });

  it("supports arrow-key navigation between stages", async () => {
    const user = userEvent.setup();
    render(wrap(<LifecycleFlow data={lifecycle} />));
    screen.getByRole("tab", { name: /simulation/i }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /raw event/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /mitigation/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("plays through the stages automatically and stops at the end", () => {
    vi.useFakeTimers();
    render(wrap(<LifecycleFlow data={lifecycle} />));
    act(() => screen.getByRole("button", { name: /play/i }).click());
    act(() => vi.advanceTimersByTime(2300));
    expect(screen.getByRole("tab", { name: /raw event/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    act(() => vi.advanceTimersByTime(2200 * 8));
    expect(screen.getByRole("tab", { name: /mitigation/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });
});
