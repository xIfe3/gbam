import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real action talks to the API; here we only check when (and whether) it is called.
vi.mock("../../actions", () => ({
  updateOrderStatus: vi.fn(async () => ({})),
}));

import { updateOrderStatus } from "../../actions";
import { CancelOrder } from "./cancel-order";

describe("CancelOrder", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(updateOrderStatus).mockClear();
    // jsdom has <dialog> but not its pop-up methods; these stand-ins just flip `open`.
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // One second at a time: each tick re-renders, and only then is the next timer set.
  async function waitSeconds(seconds: number) {
    for (let i = 0; i < seconds; i++) {
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
    }
  }

  function confirm() {
    fireEvent.click(screen.getByRole("button", { name: "Cancel order…" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel it" }));
  }

  it("only cancels on the server after the 5 second countdown", async () => {
    render(<CancelOrder orderId="order-1" code="GB-ABC123" />);
    confirm();

    expect(screen.getByText("Cancelling GB-ABC123 in 5…")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cancelling GB-ABC123 in 5 seconds. Press Undo to keep it.",
    );
    // Keyboard users land on Undo straight away.
    expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus();
    await waitSeconds(4);
    expect(screen.getByText("Cancelling GB-ABC123 in 1…")).toBeInTheDocument();
    expect(updateOrderStatus).not.toHaveBeenCalled();

    await waitSeconds(1);
    expect(updateOrderStatus).toHaveBeenCalledTimes(1);
    const formData = vi.mocked(updateOrderStatus).mock.calls[0]?.[1];
    expect(formData?.get("orderId")).toBe("order-1");
    expect(formData?.get("status")).toBe("cancelled");
  });

  it("Undo stops it: nothing is sent", async () => {
    render(<CancelOrder orderId="order-1" code="GB-ABC123" />);
    confirm();
    await waitSeconds(2);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitSeconds(10);
    expect(updateOrderStatus).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel order…" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Not cancelled.");
  });

  it("Keep order closes the box without starting a countdown", async () => {
    render(<CancelOrder orderId="order-1" code="GB-ABC123" />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel order…" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep order" }));
    await waitSeconds(10);
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(updateOrderStatus).not.toHaveBeenCalled();
  });

  it("leaving the page during the countdown sends nothing", async () => {
    const { unmount } = render(<CancelOrder orderId="order-1" code="GB-ABC123" />);
    confirm();
    unmount();
    await waitSeconds(10);
    expect(updateOrderStatus).not.toHaveBeenCalled();
  });
});
