/**
 * Checks the REAL Markdown files in packages/db/content (not fixtures), plus the packaging
 * that ships them to production. A broken file here would make a legal page 404 in
 * production, so we fail the build instead.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentFiles, type ContentFile } from "./content-loader";
import { CONTENT_DIR } from "./content-dir";

// Same list as LEGAL_DOCS in apps/web/lib/site-nav.ts (this package can't import the web
// app). Every one of these pages must exist in production.
const LEGAL_SLUGS = [
  "terms",
  "privacy",
  "cookies",
  "refunds",
  "seller-agreement",
  "acceptable-use",
  "data-deletion",
];

/** True for a real Date, or a "YYYY-MM-DD" string that parses to one. */
function isValidDate(value: unknown): boolean {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return !Number.isNaN(new Date(value).getTime());
  }
  return false;
}

function isNonEmptyText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

describe("packages/db/content", () => {
  it("points CONTENT_DIR at the real content folder", () => {
    expect(existsSync(CONTENT_DIR)).toBe(true);
    expect(existsSync(`${CONTENT_DIR}/legal`)).toBe(true);
  });

  it("parses every content file", async () => {
    // loadContentFiles throws, naming the file, if any file is malformed.
    const files = await loadContentFiles(CONTENT_DIR);
    expect(files.length).toBeGreaterThan(0);
  });

  it("has all 7 legal documents, published and complete", async () => {
    const files = await loadContentFiles(CONTENT_DIR);
    const legalBySlug = new Map<string, ContentFile>();
    for (const file of files) {
      if (file.type === "legal") {
        legalBySlug.set(file.slug, file);
      }
    }

    for (const slug of LEGAL_SLUGS) {
      const doc = legalBySlug.get(slug);
      if (doc === undefined) {
        throw new Error(`Missing legal document "${slug}"`);
      }
      expect(doc.publishedAt, `${slug} must be published`).toBeInstanceOf(Date);
      if (doc.data === null) {
        throw new Error(`Legal document "${slug}" has no frontmatter data`);
      }
      expect(isValidDate(doc.data.lastUpdated), `${slug} lastUpdated`).toBe(true);

      const sections = doc.data.sections;
      if (!Array.isArray(sections) || sections.length === 0) {
        throw new Error(`Legal document "${slug}" has no sections`);
      }
      const seenIds = new Set<string>();
      for (const section of sections) {
        expect(isNonEmptyText(section.id), `${slug} section id`).toBe(true);
        expect(isNonEmptyText(section.heading), `${slug} section heading`).toBe(true);
        expect(isNonEmptyText(section.body), `${slug} section body`).toBe(true);
        expect(isNonEmptyText(section.short), `${slug} section short`).toBe(true);
        expect(seenIds.has(section.id), `${slug} duplicate section id ${section.id}`).toBe(false);
        seenIds.add(section.id);
      }
    }
  });

  it("ships the content folder in the package (pnpm deploy copies only `files`)", () => {
    const packageJsonPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { files: string[] };
    expect(packageJson.files).toContain("content");
  });

  it("builds the sync-content script alongside migrate", () => {
    const tsupConfig = readFileSync(
      fileURLToPath(new URL("../tsup.config.ts", import.meta.url)),
      "utf8",
    );
    expect(tsupConfig).toContain("src/sync-content.ts");
  });
});
