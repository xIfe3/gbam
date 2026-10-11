import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { PaymentConfirming } from "./payment-confirming";

/** Moves the fake clock on, one second at a time, so each timer React sets up gets to run. */
async function wait(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
  }
}

describe("PaymentConfirming", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks every few seconds at first", async () => {
    render(<PaymentConfirming />);
    expect(screen.getByRole("status")).toHaveTextContent("Confirming your payment");
    await wait(60);
    expect(refresh).toHaveBeenCalledTimes(20);
  });

  it("keeps checking, more slowly, for slow bank transfers, then stops after 10 minutes", async () => {
    render(<PaymentConfirming />);
    await wait(60);
    expect(screen.getByRole("status")).toHaveTextContent("Bank transfers can take a few minutes");
    await wait(15);
    expect(refresh).toHaveBeenCalledTimes(21);

    await wait(9 * 60);
    const total = refresh.mock.calls.length;
    expect(screen.getByRole("status")).toHaveTextContent("Refresh the page");
    await wait(60);
    expect(refresh).toHaveBeenCalledTimes(total);
  });
});
