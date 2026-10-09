import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Beacon } from "./beacon";

type Sent = { tabId: string; kind: string; shop?: string; first: boolean };

function sentBodies(fetchMock: ReturnType<typeof vi.fn>): Sent[] {
  const bodies: Sent[] = [];
  for (const call of fetchMock.mock.calls) {
    const init = call[1] as RequestInit;
    bodies.push(JSON.parse(String(init.body)) as Sent);
  }
  return bodies;
}

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Beacon", () => {
  it("sends a first beat then one a minute while visible", async () => {
    // Typed like fetch so the test can read the url and body each call was given.
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
      async () => new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<Beacon kind="storefront" shop="ada" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    const bodies = sentBodies(fetchMock);
    expect(bodies).toHaveLength(3);
    expect(bodies[0]).toMatchObject({ kind: "storefront", shop: "ada", first: true });
    expect(bodies[1]?.first).toBe(false);
    // The same tab id every time, made by the page itself (no cookie).
    expect(bodies[1]?.tabId).toBe(bodies[0]?.tabId);
    expect(bodies[0]?.tabId).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/beat");
  });

  it("no beats while hidden", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Beacon kind="dashboard" />);
    visibility = "hidden";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    // Only the first beat (sent while visible on load).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a failed beat is ignored", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(() => render(<Beacon kind="product" shop="ada" />)).not.toThrow();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
  });
});
