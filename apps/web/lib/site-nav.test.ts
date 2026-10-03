import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FOOTER_GROUPS, HEADER_LINKS, LEGAL_DOCS } from "./site-nav";

// Routes whose page.tsx is not built yet. Later tasks remove entries as they build each page
// (the test below fails if a built page is left in this list).
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

function isGroup(name: string): boolean {
  return name.startsWith("(") && name.endsWith(")");
}

function isDynamic(name: string): boolean {
  return name.startsWith("[") && name.endsWith("]");
}

// Does `dir` (an app-router folder) contain a page.tsx for the remaining URL segments?
// - Route groups "(name)" are not part of the URL, so they are looked through.
// - A static folder name always wins.
// - A "[param]" folder may match a segment only below the first level: the top-level
//   [slug] is the seller storefront and must not make /features or /login look built.
// - Under "legal", the dynamic segment must be one of LEGAL_DOCS.
function hasPage(dir: string, segments: string[], depth: number): boolean {
  if (segments.length === 0 && existsSync(path.join(dir, "page.tsx"))) {
    return true;
  }
  const folders = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());

  for (const folder of folders) {
    if (isGroup(folder.name) && hasPage(path.join(dir, folder.name), segments, depth)) {
      return true;
    }
  }
  if (segments.length === 0) {
    return false;
  }
  const [first = "", ...rest] = segments;
  for (const folder of folders) {
    if (folder.name === first && hasPage(path.join(dir, folder.name), rest, depth + 1)) {
      return true;
    }
  }
  if (depth === 0) {
    return false;
  }
  for (const folder of folders) {
    if (!isDynamic(folder.name)) {
      continue;
    }
    if (path.basename(dir) === "legal" && !(LEGAL_DOCS as readonly string[]).includes(first)) {
      continue;
    }
    if (hasPage(path.join(dir, folder.name), rest, depth + 1)) {
      return true;
    }
  }
  return false;
}

function routeHasPage(appDir: string, href: string): boolean {
  const segments = href.split("/").filter((s) => s.length > 0);
  return hasPage(appDir, segments, 0);
}

const APP_DIR = path.resolve(__dirname, "../app");

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

describe("route resolver (fixture app dir)", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "gbam-routes-"));
  for (const file of [
    "(g)/x/page.tsx",
    "legal/[doc]/page.tsx",
    "[slug]/page.tsx",
    "page.tsx",
  ]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), "export default function P() { return null; }");
  }
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("looks through route groups", () => {
    expect(routeHasPage(root, "/x")).toBe(true);
  });

  it("resolves a known legal doc through legal/[doc]", () => {
    expect(routeHasPage(root, "/legal/terms")).toBe(true);
  });

  it("does not resolve an unknown legal doc", () => {
    expect(routeHasPage(root, "/legal/nonsense")).toBe(false);
  });

  it("does not let the top-level [slug] satisfy a marketing route", () => {
    expect(routeHasPage(root, "/features")).toBe(false);
  });

  it("resolves the home page", () => {
    expect(routeHasPage(root, "/")).toBe(true);
  });

  it("resolves the home page when it lives in a route group", () => {
    const grouped = mkdtempSync(path.join(os.tmpdir(), "gbam-routes-home-"));
    mkdirSync(path.join(grouped, "(marketing)"), { recursive: true });
    writeFileSync(
      path.join(grouped, "(marketing)", "page.tsx"),
      "export default function P() { return null; }",
    );
    expect(routeHasPage(grouped, "/")).toBe(true);
    rmSync(grouped, { recursive: true, force: true });
  });
});

describe("site-nav", () => {
  it("lists every legal document in the footer", () => {
    for (const doc of LEGAL_DOCS) {
      expect(allHrefs).toContain(`/legal/${doc}`);
    }
  });

  it("only keeps routes in PENDING_ROUTES that have no page yet", () => {
    const built = PENDING_ROUTES.filter((href) => routeHasPage(APP_DIR, href));
    expect(built).toEqual([]);
  });

  for (const href of internalHrefs) {
    if (PENDING_ROUTES.includes(href)) {
      it.todo(`${href} has a page.tsx`);
    } else {
      it(`${href} has a page.tsx`, () => {
        expect(routeHasPage(APP_DIR, href)).toBe(true);
      });
    }
  }
});
