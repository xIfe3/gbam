/** Integration test against the dev Postgres: the deploy-time content sync. */
import "reflect-metadata";
import { contentEntries, upsertContent } from "@gbam/db";
import { Test, type TestingModule } from "@nestjs/testing";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";

process.loadEnvFile?.("../../.env");

describe("content sync (integration)", () => {
  let moduleRef: TestingModule;
  let db: Db;
  const slugs: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule] }).compile();
    db = moduleRef.get(DB);
  });

  afterAll(async () => {
    if (slugs.length > 0) {
      await db.delete(contentEntries).where(inArray(contentEntries.slug, slugs));
    }
    await moduleRef.close();
  });

  function file(slug: string, title: string) {
    return {
      type: "help_article" as const,
      slug,
      title,
      summary: null,
      body: "From the Markdown file",
      data: null,
      category: null,
      sortOrder: 0,
      publishedAt: new Date("2026-01-01"),
    };
  }

  async function titleOf(slug: string): Promise<string | undefined> {
    const rows = await db
      .select()
      .from(contentEntries)
      .where(and(eq(contentEntries.type, "help_article"), eq(contentEntries.slug, slug)));
    return rows[0]?.title;
  }

  it("sync adds missing entries", async () => {
    const slug = `sync-${randomUUID().slice(0, 8)}`;
    slugs.push(slug);
    await upsertContent(db, [file(slug, "First title")]);
    expect(await titleOf(slug)).toBe("First title");
  });

  it("sync never overwrites (the database is the master copy)", async () => {
    const slug = `sync-${randomUUID().slice(0, 8)}`;
    slugs.push(slug);
    await upsertContent(db, [file(slug, "From the file")]);
    // An admin edits it in the content editor.
    await db
      .update(contentEntries)
      .set({ title: "Edited by an admin" })
      .where(eq(contentEntries.slug, slug));
    // The next deploy runs the sync again, with the file changed too.
    await upsertContent(db, [file(slug, "File changed later")]);
    expect(await titleOf(slug)).toBe("Edited by an admin");
  });
});
