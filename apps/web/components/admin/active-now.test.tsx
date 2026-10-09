import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveNow, type ActiveCounts } from "./active-now";

const FIRST: ActiveCounts = {
  sellersInDashboard: 2,
  shoppers: 5,
  checkout: 1,
  admins: 1,
  topShops: [{ slug: "ada", count: 3 }],
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ActiveNow", () => {
  it("active now refreshes", async () => {
    const load = vi.fn(async () => ({ ...FIRST, shoppers: 9 }));
    render(<ActiveNow initial={FIRST} load={load} />);
    expect(screen.getByText("Shoppers").parentElement).toHaveTextContent("5");
    expect(screen.getByRole("link", { name: "ada" })).toHaveAttribute("href", "/ada");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Shoppers").parentElement).toHaveTextContent("9");
  });

  it("keeps the last numbers when a refresh fails", async () => {
    const load = vi.fn(async (): Promise<ActiveCounts> => {
      throw new Error("down");
    });
    render(<ActiveNow initial={FIRST} load={load} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.getByText("Shoppers").parentElement).toHaveTextContent("5");
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't refresh");
  });
});
