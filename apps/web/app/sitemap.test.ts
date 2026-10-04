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
      expect(url).not.toMatch(/\/(login|signup)$/);
    }
  });

  it("falls back to the static routes when the API is down", async () => {
    listContent.mockRejectedValue(new Error("API down"));
    const all = await urls();
    expect(all).toContain("https://gbam.app/pricing");
    expect(all).not.toContain("https://gbam.app/help/how-to-pay");
  });
});

// Robots rules are prefix matches; "$" means "end of the path". This mimics that so the test
// can check which real paths a rule would block.
function isBlocked(rule: string, path: string): boolean {
  if (rule.endsWith("$")) {
    return path === rule.slice(0, -1);
  }
  return path.startsWith(rule);
}

function blockedBy(path: string): string[] {
  const rules = robots().rules;
  const list = [];
  if (Array.isArray(rules)) {
    list.push(...rules);
  } else {
    list.push(rules);
  }
  const hits: string[] = [];
  for (const rule of list) {
    let disallow: string[] = [];
    if (Array.isArray(rule.disallow)) {
      disallow = rule.disallow;
    } else if (rule.disallow) {
      disallow = [rule.disallow];
    }
    for (const entry of disallow) {
      if (isBlocked(entry, path)) {
        hits.push(entry);
      }
    }
  }
  return hits;
}

describe("robots", () => {
  it("points at the sitemap", () => {
    expect(robots().sitemap).toBe("https://gbam.app/sitemap.xml");
  });

  it("blocks the dashboard, sign-up steps and reset flows", () => {
    expect(blockedBy("/dashboard")).not.toEqual([]);
    expect(blockedBy("/dashboard/orders/abc")).not.toEqual([]);
    expect(blockedBy("/signup/verify")).not.toEqual([]);
    expect(blockedBy("/reset-password")).not.toEqual([]);
    expect(blockedBy("/forgot-password")).not.toEqual([]);
  });

  it("does not block storefronts whose slug starts with a blocked word", () => {
    expect(blockedBy("/dashboardcafe")).toEqual([]);
    expect(blockedBy("/reset-password-shop")).toEqual([]);
    expect(blockedBy("/forgot-password-store")).toEqual([]);
  });

  it("does not block public pages", () => {
    expect(blockedBy("/legal/terms")).toEqual([]);
    expect(blockedBy("/help")).toEqual([]);
    expect(blockedBy("/pricing")).toEqual([]);
  });
});
