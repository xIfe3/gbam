/**
 * ink-subtle (#6B7A72) on the blush page background (#FFF8F5) is about 4.3:1, below the
 * 4.5:1 that WCAG AA asks for small text. Small text uses ink-muted instead. Placeholders
 * (placeholder:text-ink-subtle) are exempt, so they are ignored here.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WEB_DIR = fileURLToPath(new URL("../", import.meta.url));

function tsxFiles(dir: string, found: string[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      tsxFiles(full, found);
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      found.push(full);
    }
  }
}

describe("small text contrast", () => {
  it("never pairs text-ink-subtle with text-sm", () => {
    const files: string[] = [];
    tsxFiles(path.join(WEB_DIR, "app"), files);
    tsxFiles(path.join(WEB_DIR, "components"), files);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // Every quoted class string, e.g. className="text-ink-subtle text-sm".
      const classStrings = source.match(/"[^"\n]*"/g);
      if (classStrings === null) {
        continue;
      }
      for (const classString of classStrings) {
        const classes = classString.slice(1, -1).split(/\s+/);
        if (classes.includes("text-ink-subtle") && classes.includes("text-sm")) {
          offenders.push(`${path.relative(WEB_DIR, file)}: ${classString}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
