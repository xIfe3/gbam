/**
 * Storefronts live at gbam.app/{slug}. If a seller could pick a slug that is also one of
 * our own top-level routes (say "features"), one of the two pages would be unreachable.
 * This test reads apps/web/app and checks every top-level route is a reserved slug.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESERVED_SLUGS, slugSchema } from "@gbam/shared";
import { describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("./", import.meta.url));

// Files that make a page or endpoint at their own folder's URL.
const ROUTE_FILES = ["page.tsx", "page.ts", "route.ts", "route.tsx"];

// Metadata files that Next serves as top-level URLs of their own, e.g. app/icon.tsx →
// /icon and app/sitemap.ts → /sitemap.xml.
const METADATA_ROUTES: Record<string, string> = {
  icon: "icon",
  "apple-icon": "apple-icon",
  "opengraph-image": "opengraph-image",
  "twitter-image": "twitter-image",
  sitemap: "sitemap.xml",
  robots: "robots.txt",
  manifest: "manifest.webmanifest",
};

function isGroup(name: string): boolean {
  return name.startsWith("(") && name.endsWith(")");
}

/** True if this folder, or any folder inside it, has a page or route file. */
function containsRoute(dir: string): boolean {
  for (const file of ROUTE_FILES) {
    if (existsSync(path.join(dir, file))) {
      return true;
    }
  }
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && containsRoute(path.join(dir, entry.name))) {
      return true;
    }
  }
  return false;
}

/**
 * Collects the first URL segment of every route in `dir`. Route groups like "(marketing)"
 * are not part of the URL, so we look inside them. Dynamic folders ("[slug]") and private
 * folders ("_components") are skipped: they don't claim a fixed name.
 */
function topLevelSegments(dir: string, found: Set<string>): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (entry.isDirectory()) {
      if (isGroup(name)) {
        topLevelSegments(path.join(dir, name), found);
        continue;
      }
      if (name.startsWith("[") || name.startsWith("_")) {
        continue;
      }
      if (containsRoute(path.join(dir, name))) {
        found.add(name);
      }
      continue;
    }
    // A metadata file such as icon.tsx (but not icon.test.tsx).
    const parts = name.split(".");
    if (parts.length !== 2) {
      continue;
    }
    const base = parts[0];
    if (base !== undefined && base in METADATA_ROUTES) {
      const segment = METADATA_ROUTES[base];
      if (segment !== undefined) {
        found.add(segment);
      }
    }
  }
}

describe("RESERVED_SLUGS", () => {
  const segments = new Set<string>();
  topLevelSegments(APP_DIR, segments);

  it("finds this app's routes (sanity check of the folder walk)", () => {
    expect(segments).toContain("dashboard");
    expect(segments).toContain("features");
    expect(segments).toContain("reset-password");
    expect(segments).toContain("icon");
    expect(segments).not.toContain("home"); // components only, no page
  });

  it("can never be taken by a storefront slug", () => {
    for (const segment of segments) {
      // Names like "sitemap.xml" already fail the slug format (no dots allowed); every
      // other route name must be on the reserved list.
      const formatOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment);
      if (formatOk) {
        expect(RESERVED_SLUGS.has(segment), `"${segment}" is missing from RESERVED_SLUGS`).toBe(
          true,
        );
      }
      expect(slugSchema.safeParse(segment).success, `"${segment}" is a valid slug`).toBe(false);
    }
  });
});
