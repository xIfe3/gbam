import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  saveTourStepAction: vi.fn().mockResolvedValue({ ok: true }),
  finishTourAction: vi.fn().mockResolvedValue({ ok: true }),
}));

import { finishTourAction, saveTourStepAction } from "./actions";
import { PageTour, PageTourWith } from "./page-tour";
import { forgetToursForTests, ToursProvider, useTours } from "./tours-provider";

const save = vi.mocked(saveTourStepAction);
const finish = vi.mocked(finishTourAction);

/** A pretend "?" button that replays the page's tour through the provider. */
function ReplayButton() {
  const tours = useTours();
  return (
    <button type="button" onClick={() => tours?.replayCurrent()}>
      replay
    </button>
  );
}

describe("PageTour", () => {
  beforeEach(() => {
    forgetToursForTests();
    save.mockClear();
    finish.mockClear();
    save.mockResolvedValue({ ok: true });
  });

  it("opens on step 1 for a tour never started", () => {
    render(<PageTourWith tour="editor" saved={undefined} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("1 of 5");
    expect(screen.getByRole("heading", { name: "Add 1 to 4 photos" })).toBeInTheDocument();
  });

  it("resumes on the saved step", () => {
    render(<PageTourWith tour="editor" saved={{ step: 3, outcome: null }} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("3 of 5");
  });

  it("resumes on the last step when the saved step is past the end of a shorter tour", () => {
    render(<PageTourWith tour="order" saved={{ step: 9, outcome: null }} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("3 of 3");
  });

  it("saves the step going forward and back", () => {
    render(<PageTourWith tour="editor" saved={{ step: 2, outcome: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(save).toHaveBeenLastCalledWith("editor", 3);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(save).toHaveBeenLastCalledWith("editor", 2);
    expect(screen.getByRole("dialog")).toHaveTextContent("2 of 5");
  });

  it("keeps going when saving fails (offline)", async () => {
    save.mockRejectedValue(new Error("offline"));
    render(<PageTourWith tour="editor" saved={undefined} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });
    expect(screen.getByRole("dialog")).toHaveTextContent("2 of 5");
  });

  it("Skip records skipped and closes; Esc does the same", () => {
    const { unmount } = render(<PageTourWith tour="dashboard" saved={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(finish).toHaveBeenCalledWith("dashboard", "skipped");
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();

    render(<PageTourWith tour="dashboard" saved={undefined} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(finish).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Done on the last step records completed", () => {
    render(<PageTourWith tour="order" saved={{ step: 3, outcome: null }} />);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(finish).toHaveBeenCalledWith("order", "completed");
  });

  it("never opens by itself once completed or skipped", () => {
    const { unmount } = render(
      <PageTourWith tour="editor" saved={{ step: 5, outcome: "completed" }} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
    render(<PageTourWith tour="editor" saved={{ step: 2, outcome: "skipped" }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the ? replay starts from step 1 and saves nothing", () => {
    render(
      <ToursProvider states={{}}>
        <PageTourWith tour="order" saved={{ step: 2, outcome: "completed" }} />
        <ReplayButton />
      </ToursProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "replay" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(save).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it("makes the element of the current step glow", () => {
    render(
      <>
        <div data-tour="photos">photos area</div>
        <PageTourWith tour="editor" saved={undefined} />
      </>,
    );
    expect(screen.getByText("photos area")).toHaveAttribute("data-tour-active");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("photos area")).not.toHaveAttribute("data-tour-active");
  });

  it("remembers a finished tour while moving between pages (the layout doesn't reload)", () => {
    const { rerender } = render(
      <ToursProvider states={{}}>
        <PageTour tour="dashboard" />
      </ToursProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    // Leave the page, then come back: same provider, stale server data.
    rerender(<ToursProvider states={{}}>{null}</ToursProvider>);
    rerender(
      <ToursProvider states={{}}>
        <PageTour tour="dashboard" />
      </ToursProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resumes on the step reached earlier in this visit", () => {
    const { rerender } = render(
      <ToursProvider states={{}}>
        <PageTour tour="editor" />
      </ToursProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    rerender(<ToursProvider states={{}}>{null}</ToursProvider>);
    rerender(
      <ToursProvider states={{}}>
        <PageTour tour="editor" />
      </ToursProvider>,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("3 of 5");
  });

  it("does not open by itself when progress couldn't be loaded", () => {
    render(
      <ToursProvider states={null}>
        <PageTour tour="editor" />
      </ToursProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays finished when the whole layout is rebuilt from Next's stale cache", () => {
    const first = render(
      <ToursProvider states={{}}>
        <PageTour tour="dashboard" />
      </ToursProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    first.unmount();
    // Back/Forward restores the layout with the progress it loaded the first time.
    render(
      <ToursProvider states={{}}>
        <PageTour tour="dashboard" />
      </ToursProvider>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("? during an unfinished tour restarts it and still saves and finishes", () => {
    render(
      <ToursProvider states={{}}>
        <PageTour tour="order" />
        <ReplayButton />
      </ToursProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    save.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "replay" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("1 of 3");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(save).toHaveBeenLastCalledWith("order", 2);
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(finish).toHaveBeenCalledWith("order", "skipped");
  });

  it("Esc typed inside a form field does not skip the tour", () => {
    render(
      <>
        <input aria-label="Product name" />
        <PageTourWith tour="editor" saved={undefined} />
      </>,
    );
    const field = screen.getByRole("textbox", { name: "Product name" });
    field.focus();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(finish).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("glows a target that appears after the step opened (e.g. the next wizard step)", async () => {
    render(<PageTourWith tour="editor" saved={{ step: 3, outcome: null }} />);
    const later = document.createElement("fieldset");
    later.setAttribute("data-tour", "options");
    await act(async () => {
      document.body.appendChild(later);
    });
    expect(later).toHaveAttribute("data-tour-active");
    later.remove();
  });

  it("adds room at the BOTTOM of the page while open, not a gap where the tour sits", () => {
    const { container } = render(<PageTourWith tour="dashboard" saved={undefined} />);
    // Nothing rendered in place except the card itself.
    expect(container.querySelector("[aria-hidden='true'].h-80")).toBeNull();
    expect(document.body.style.paddingBottom).not.toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(document.body.style.paddingBottom).toBe("");
  });
});
