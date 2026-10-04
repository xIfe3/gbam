import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { listContent } = vi.hoisted(() => ({ listContent: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { listContent } }));

import { LEGAL_DOCS } from "@/lib/site-nav";
import robots from "./robots";
import sitemap from "./sitemap";

function entry(slug: string) {
  return {
    slug,
    title: slug,
    summary: null,
    category: null,
    sortOrder: 0,
    publishedAt: "2026-01-01",
  };
}

async function urls(): Promise<string[]> {
  const items = await sitemap();
  const result: string[] = [];
  for (const item of items) {
    result.push(item.url);
  }
  return result;
}

beforeEach(() => {
  listContent.mockReset();
  listContent.mockImplementation(async (type: string) => {
    if (type === "help_article") {
      return [entry("how-to-pay")];
    }
    return [entry("first-post")];
  });
});

describe("sitemap", () => {
  it("contains the home page and the pricing page", async () => {
    const all = await urls();
    expect(all).toContain("https://gbam.app/");
    expect(all).toContain("https://gbam.app/pricing");
  });

  it("contains every legal document", async () => {
    const all = await urls();
    for (const doc of LEGAL_DOCS) {
      expect(all).toContain(`https://gbam.app/legal/${doc}`);
    }
  });

  it("contains help article and blog post slugs from the content list", async () => {
    const all = await urls();
    expect(all).toContain("https://gbam.app/help/how-to-pay");
    expect(all).toContain("https://gbam.app/blog/first-post");
  });

  it("contains no dashboard or auth-flow URLs", async () => {
    const all = await urls();
    for (const url of all) {
      expect(url).not.toContain("/dashboard");
      expect(url).not.toContain("/signup/");
      expect(url).not.toContain("/reset-password");
    }
  });

  it("falls back to the static routes when the API is down", async () => {
    listContent.mockRejectedValue(new Error("API down"));
    const all = await urls();
    expect(all).toContain("https://gbam.app/pricing");
    expect(all).not.toContain("https://gbam.app/help/how-to-pay");
  });
});

describe("robots", () => {
  it("disallows the dashboard and points at the sitemap", () => {
    const result = robots();
    expect(JSON.stringify(result.rules)).toContain("/dashboard");
    expect(result.sitemap).toBe("https://gbam.app/sitemap.xml");
  });
});
