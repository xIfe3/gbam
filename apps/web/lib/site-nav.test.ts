import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FOOTER_GROUPS, HEADER_LINKS, LEGAL_DOCS } from "./site-nav";

// Routes whose page.tsx is not built yet. Later tasks remove entries as they build each page.
const PENDING_ROUTES: string[] = [
  "/features",
  "/how-it-works",
  "/pricing",
  "/use-cases",
  "/about",
  "/mission",
  "/security",
  "/contact",
  "/help",
  "/faq",
  "/blog",
  "/changelog",
  "/login",
  "/signup",
  ...LEGAL_DOCS.map((doc) => `/legal/${doc}`),
];

const APP_DIR = path.resolve(__dirname, "../app");

// Route groups "(name)" don't appear in URLs, so they are looked through.
// "[doc]" / "[slug]" folders match any single segment.
function hasPage(dir: string, segments: string[]): boolean {
  if (segments.length === 0) {
    return existsSync(path.join(dir, "page.tsx"));
  }
  const [first, ...rest] = segments;
  const entries = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const entry of entries) {
    const isGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
    const isDynamic = entry.name.startsWith("[") && entry.name.endsWith("]");
    if (isGroup && hasPage(path.join(dir, entry.name), segments)) {
      return true;
    }
    if (entry.name === first && hasPage(path.join(dir, entry.name), rest)) {
      return true;
    }
    if (isDynamic && hasPage(path.join(dir, entry.name), rest)) {
      return true;
    }
  }
  return false;
}

function routeHasPage(href: string): boolean {
  const segments = href.split("/").filter((s) => s.length > 0);
  return hasPage(APP_DIR, segments);
}

const allHrefs: string[] = [];
for (const link of HEADER_LINKS) {
  allHrefs.push(link.href);
}
for (const group of FOOTER_GROUPS) {
  for (const link of group.links) {
    allHrefs.push(link.href);
  }
}
const internalHrefs = [...new Set(allHrefs.filter((h) => h.startsWith("/")))];

describe("site-nav", () => {
  it("lists every legal document in the footer", () => {
    for (const doc of LEGAL_DOCS) {
      expect(allHrefs).toContain(`/legal/${doc}`);
    }
  });

  for (const href of internalHrefs) {
    if (PENDING_ROUTES.includes(href)) {
      it.todo(`${href} has a page.tsx`);
    } else {
      it(`${href} has a page.tsx`, () => {
        expect(routeHasPage(href)).toBe(true);
      });
    }
  }
});
