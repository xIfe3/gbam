import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  saveTourStepAction: vi.fn().mockResolvedValue({ ok: true }),
  finishTourAction: vi.fn().mockResolvedValue({ ok: true }),
}));

import { HelpButton } from "./help-button";
import { PageTour } from "./page-tour";
import { ToursProvider } from "./tours-provider";

describe("HelpButton", () => {
  it("links to the help centre on a page without a tour", () => {
    render(
      <ToursProvider states={{}}>
        <HelpButton />
      </ToursProvider>,
    );
    expect(screen.getByRole("link", { name: "Help centre" })).toHaveAttribute("href", "/help");
  });

  it("replays this page's finished tour from step 1", () => {
    render(
      <ToursProvider states={{ order: { step: 3, outcome: "completed" } }}>
        <HelpButton />
        <PageTour tour="order" />
      </ToursProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show me around this page" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("1 of 3");
  });
});
