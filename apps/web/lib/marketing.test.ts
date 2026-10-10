// @vitest-environment node
import { MARKETING_DEFAULTS } from "@gbam/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => undefined }));

import { clearMarketingCache, getMarketing } from "./marketing";

beforeEach(() => {
  clearMarketingCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getMarketing", () => {
  it("published fields shown, and reused for a minute", async () => {
    const header = { ...MARKETING_DEFAULTS.about.header, title: "Why we built Gbam" };
    const fetchMock = vi.fn(async () => Response.json({ ...MARKETING_DEFAULTS.about, header }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await getMarketing("about")).header.title).toBe("Why we built Gbam");
    await getMarketing("about");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toMatch(/\/content\/marketing\/about$/);
  });

  it("defaults when the API can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    expect(await getMarketing("mission")).toEqual(MARKETING_DEFAULTS.mission);
  });

  it("an odd answer falls back field by field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ heroSubtitle: "Sell more.", primaryButton: 7 })),
    );
    const fields = await getMarketing("home");
    expect(fields.heroSubtitle).toBe("Sell more.");
    expect(fields.primaryButton).toBe(MARKETING_DEFAULTS.home.primaryButton);
  });
});
