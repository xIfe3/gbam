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
 * category, sortOrder, published and date fill columns; all other keys land in `data`.
 * `published: true` requires a valid `date` (it becomes published_at), so re-seeding
 * never changes it. Wrong types throw an error naming the file and the field.
 */
export async function loadContentFiles(rootDir: string): Promise<ContentFile[]> {
  const result: ContentFile[] = [];
  const folders = await readdir(rootDir, { withFileTypes: true });
  // Sorted so the load order is the same on every machine.
  folders.sort((a, b) => a.name.localeCompare(b.name));

  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    if (!isContentType(folder.name)) {
      throw new Error(`Unknown content type "${folder.name}"`);
    }

    const folderPath = path.join(rootDir, folder.name);
    const names = await readdir(folderPath);
    names.sort();
    for (const name of names) {
      if (!name.endsWith(".md")) continue;
      const filePath = path.join(folderPath, name);
      const parsed = matter(await readFile(filePath, "utf8"));
      const meta = parsed.data;

      if (typeof meta.title !== "string" || meta.title.trim() === "") {
        throw new Error(`Content file ${filePath} is missing a "title" in its frontmatter`);
      }

      // Each optional field must have the right type. We throw instead of guessing, so a
      // typo in a Markdown file is caught here and names the file.
      const bad = (field: string, expected: string) =>
        new Error(`Content file ${filePath}: "${field}" must be ${expected}`);

      if (meta.published !== undefined && typeof meta.published !== "boolean") {
        throw bad("published", "true or false");
      }
      if (meta.summary !== undefined && typeof meta.summary !== "string") {
        throw bad("summary", "text");
      }
      if (meta.category !== undefined && typeof meta.category !== "string") {
        throw bad("category", "text");
      }
      if (meta.sortOrder !== undefined && !Number.isInteger(meta.sortOrder)) {
        throw bad("sortOrder", "a whole number");
      }

      // YAML turns an unquoted 2026-01-15 into a Date already; quoted dates stay strings.
      let date: Date | null = null;
      if (meta.date instanceof Date) {
        date = meta.date;
      } else if (typeof meta.date === "string") {
        date = new Date(meta.date);
      } else if (meta.date !== undefined) {
        throw bad("date", "a valid date");
      }
      if (date !== null && Number.isNaN(date.getTime())) {
        throw bad("date", "a valid date");
      }

      // A fixed date keeps re-seeding idempotent, so published files must have one.
      let publishedAt: Date | null = null;
      if (meta.published === true) {
        if (date === null) {
          throw bad("date", "set (a valid date) when published is true");
        }
        publishedAt = date;
      }

      const extra: Record<string, unknown> = {};
      let hasExtra = false;
      for (const key of Object.keys(meta)) {
        if (COLUMN_KEYS.includes(key)) continue;
        extra[key] = meta[key];
        hasExtra = true;
      }

      let summary: string | null = null;
      if (meta.summary !== undefined) summary = meta.summary;
      let category: string | null = null;
      if (meta.category !== undefined) category = meta.category;
      let sortOrder = 0;
      if (meta.sortOrder !== undefined) sortOrder = meta.sortOrder;

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
