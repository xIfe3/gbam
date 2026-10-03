import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadContentFiles } from "./content-loader";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "gbam-content-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeFixture(folder: string, file: string, text: string) {
  await mkdir(path.join(root, folder), { recursive: true });
  await writeFile(path.join(root, folder, file), text);
}

describe("loadContentFiles", () => {
  it("maps frontmatter to columns and strips it from the body", async () => {
    await writeFixture(
      "help_article",
      "getting-started.md",
      "---\ntitle: Getting started\nsummary: First steps\ncategory: Basics\nsortOrder: 2\npublished: true\ndate: 2026-02-01\n---\n\nHello there.\n",
    );
    const files = await loadContentFiles(root);
    expect(files).toHaveLength(1);
    const file = files[0]!;
    expect(file.type).toBe("help_article");
    expect(file.slug).toBe("getting-started");
    expect(file.title).toBe("Getting started");
    expect(file.summary).toBe("First steps");
    expect(file.category).toBe("Basics");
    expect(file.sortOrder).toBe(2);
    expect(file.body).toBe("Hello there.");
    expect(file.publishedAt).toBeInstanceOf(Date);
    expect(file.data).toBeNull();
  });

  it("leaves publishedAt null when published is false", async () => {
    await writeFixture("faq", "draft.md", "---\ntitle: Draft\npublished: false\n---\nBody\n");
    const files = await loadContentFiles(root);
    expect(files[0]!.publishedAt).toBeNull();
  });

  it("uses the date key as publishedAt when published", async () => {
    await writeFixture(
      "blog_post",
      "hello.md",
      "---\ntitle: Hello\npublished: true\ndate: 2026-01-15\n---\nBody\n",
    );
    const files = await loadContentFiles(root);
    expect(files[0]!.publishedAt?.toISOString()).toBe("2026-01-15T00:00:00.000Z");
    expect(files[0]!.data).toBeNull();
  });

  it("puts every other frontmatter key into data", async () => {
    await writeFixture(
      "legal",
      "terms.md",
      "---\ntitle: Terms\npublished: false\nlastUpdated: 2026-10-01\nsections:\n  - heading: One\n    body: Text\n---\n",
    );
    const files = await loadContentFiles(root);
    const data = files[0]!.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(["lastUpdated", "sections"]);
    expect(data.sections).toEqual([{ heading: "One", body: "Text" }]);
  });

  it("throws for a folder that is not a content type", async () => {
    await writeFixture("x", "a.md", "---\ntitle: A\n---\n");
    await expect(loadContentFiles(root)).rejects.toThrow('Unknown content type "x"');
  });

  it("throws naming the file when title is missing", async () => {
    await writeFixture("faq", "no-title.md", "---\nsummary: hi\n---\nBody\n");
    await expect(loadContentFiles(root)).rejects.toThrow(/no-title\.md/);
  });

  it("throws naming the file when published has no date", async () => {
    await writeFixture("faq", "nodate.md", "---\ntitle: T\npublished: true\n---\nBody\n");
    await expect(loadContentFiles(root)).rejects.toThrow(/nodate\.md.*date/);
  });

  it("throws for an invalid date", async () => {
    await writeFixture("faq", "baddate.md", "---\ntitle: T\npublished: true\ndate: soon\n---\n");
    await expect(loadContentFiles(root)).rejects.toThrow(/baddate\.md.*date/);
  });

  it("throws when published is a string", async () => {
    await writeFixture("faq", "str.md", '---\ntitle: T\npublished: "true"\n---\n');
    await expect(loadContentFiles(root)).rejects.toThrow(/str\.md.*published/);
  });

  it("throws when sortOrder is not an integer", async () => {
    await writeFixture("faq", "sort.md", "---\ntitle: T\nsortOrder: 1.5\n---\n");
    await expect(loadContentFiles(root)).rejects.toThrow(/sort\.md.*sortOrder/);
  });

  it("throws when summary is not a string", async () => {
    await writeFixture("faq", "sum.md", "---\ntitle: T\nsummary: 5\n---\n");
    await expect(loadContentFiles(root)).rejects.toThrow(/sum\.md.*summary/);
  });
});
