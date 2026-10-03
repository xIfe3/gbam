import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import matter from "gray-matter";
import type { Db } from "./client";
import { contentEntries, contentTypeEnum } from "./schema";

export type ContentType = (typeof contentTypeEnum.enumValues)[number];

/** One Markdown file, ready to be written to the content_entries table. */
export type ContentFile = {
  type: ContentType;
  slug: string;
  title: string;
  summary: string | null;
  body: string;
  data: Record<string, unknown> | null;
  category: string | null;
  sortOrder: number;
  publishedAt: Date | null;
};

// These frontmatter keys become columns. Every other key goes into `data`.
const COLUMN_KEYS = ["title", "summary", "category", "sortOrder", "published", "date"];

function isContentType(value: string): value is ContentType {
  return (contentTypeEnum.enumValues as string[]).includes(value);
}

/**
 * Reads `<rootDir>/<content type>/<slug>.md` files. Frontmatter keys title, summary,
 * category, sortOrder and published fill columns; all other keys land in `data`.
 */
export async function loadContentFiles(rootDir: string): Promise<ContentFile[]> {
  const result: ContentFile[] = [];
  const folders = await readdir(rootDir, { withFileTypes: true });

  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    if (!isContentType(folder.name)) {
      throw new Error(`Unknown content type "${folder.name}"`);
    }

    const folderPath = path.join(rootDir, folder.name);
    const names = await readdir(folderPath);
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const filePath = path.join(folderPath, name);
      const parsed = matter(await readFile(filePath, "utf8"));
      const meta = parsed.data;

      if (typeof meta.title !== "string" || meta.title.trim() === "") {
        throw new Error(`Content file ${filePath} is missing a "title" in its frontmatter`);
      }

      let publishedAt: Date | null = null;
      if (meta.published === true) {
        // YAML turns an unquoted 2026-01-15 into a Date already.
        if (meta.date instanceof Date) {
          publishedAt = meta.date;
        } else if (typeof meta.date === "string") {
          publishedAt = new Date(meta.date);
        } else {
          publishedAt = new Date();
        }
      }

      const extra: Record<string, unknown> = {};
      let hasExtra = false;
      for (const key of Object.keys(meta)) {
        if (COLUMN_KEYS.includes(key)) continue;
        extra[key] = meta[key];
        hasExtra = true;
      }

      let summary: string | null = null;
      if (typeof meta.summary === "string") summary = meta.summary;
      let category: string | null = null;
      if (typeof meta.category === "string") category = meta.category;
      let sortOrder = 0;
      if (typeof meta.sortOrder === "number") sortOrder = meta.sortOrder;

      result.push({
        type: folder.name,
        slug: name.slice(0, -".md".length),
        title: meta.title,
        summary,
        body: parsed.content.trim(),
        data: hasExtra ? extra : null,
        category,
        sortOrder,
        publishedAt,
      });
    }
  }
  return result;
}

/** Inserts or updates each file by (type, slug). Returns how many files were written. */
export async function upsertContent(db: Db, files: ContentFile[]): Promise<number> {
  for (const file of files) {
    await db
      .insert(contentEntries)
      .values(file)
      .onConflictDoUpdate({
        target: [contentEntries.type, contentEntries.slug],
        set: {
          title: file.title,
          summary: file.summary,
          body: file.body,
          data: file.data,
          category: file.category,
          sortOrder: file.sortOrder,
          publishedAt: file.publishedAt,
          updatedAt: sql`now()`,
        },
      });
  }
  return files.length;
}
