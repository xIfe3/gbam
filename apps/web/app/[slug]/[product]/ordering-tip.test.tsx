import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderingTip } from "./ordering-tip";

const KEY = "gbam-tip-ordering";
const TEXT = /Pick your options → Add to order → Place order/;

describe("OrderingTip", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the first time and is gone for good after Got it", async () => {
    const { unmount } = render(<OrderingTip />);
    expect(await screen.findByText(TEXT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(TEXT)).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe("seen");
    unmount();

    render(<OrderingTip />);
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it("stays hidden when this browser has already seen it", () => {
    window.localStorage.setItem(KEY, "seen");
    render(<OrderingTip />);
    expect(screen.queryByText(TEXT)).toBeNull();
  });

  it("still works when the browser blocks storage (private mode)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<OrderingTip />);
    expect(await screen.findByText(TEXT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(TEXT)).toBeNull();
  });
});
