import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiMock } = vi.hoisted(() => ({ apiMock: { unsubscribe: vi.fn() } }));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: class extends Error {} }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));

import { unsubscribeAction } from "./actions";
import UnsubscribePage from "./page";

const S = "6f1c1f0e-2b7a-4d61-9a5e-2f5a1c9b0d11";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("unsubscribe page", () => {
  it("asks before unsubscribing (opening the link changes nothing)", async () => {
    render(await UnsubscribePage({ searchParams: Promise.resolve({ s: S, t: "token" }) }));
    expect(screen.getByRole("button", { name: "Unsubscribe" })).toBeInTheDocument();
    expect(apiMock.unsubscribe).not.toHaveBeenCalled();
  });

  it("a link without its parts says so", async () => {
    render(await UnsubscribePage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("button", { name: "Unsubscribe" })).toBeNull();
    expect(screen.getByText(/link isn't complete/)).toBeInTheDocument();
  });

  it("the button unsubscribes", async () => {
    apiMock.unsubscribe.mockResolvedValue({ ok: true });
    const state = await unsubscribeAction(S, "token", {});
    expect(apiMock.unsubscribe).toHaveBeenCalledWith(S, "token");
    expect(state.notice).toContain("won't get news and tips");
  });

  it("a bad link is explained", async () => {
    apiMock.unsubscribe.mockRejectedValue(new Error("400"));
    const state = await unsubscribeAction(S, "bad", {});
    expect(state.error).toContain("Settings");
  });
});
