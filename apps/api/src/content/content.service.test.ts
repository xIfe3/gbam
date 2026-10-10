/**
 * Integration test against the dev Postgres (pnpm db:up && pnpm db:migrate).
 * Slugs are random so runs never collide; rows are removed afterwards.
 */
import "reflect-metadata";
import { contentEntries } from "@gbam/db";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { ContentModule } from "./content.module.js";
import { ContentService } from "./content.service.js";

process.loadEnvFile?.("../../.env");

describe("ContentService (integration)", () => {
  let moduleRef: TestingModule;
  let service: ContentService;
  let db: Db;
  const publishedSlug = `pub-${randomUUID().slice(0, 8)}`;
  const draftSlug = `draft-${randomUUID().slice(0, 8)}`;
  const futureSlug = `future-${randomUUID().slice(0, 8)}`;
  // Ordering rows: a = sortOrder 1 (older), b = sortOrder 2 (older), c = sortOrder 2 (newer).
  const orderA = `ord-a-${randomUUID().slice(0, 8)}`;
  const orderB = `ord-b-${randomUUID().slice(0, 8)}`;
  const orderC = `ord-c-${randomUUID().slice(0, 8)}`;
  const allSlugs = [publishedSlug, draftSlug, futureSlug, orderA, orderB, orderC];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, ContentModule] }).compile();
    service = moduleRef.get(ContentService);
    db = moduleRef.get(DB);
    await db.insert(contentEntries).values([
      {
        type: "help_article",
        slug: publishedSlug,
        title: "Published",
        body: "Hello",
        publishedAt: new Date("2026-01-01"),
      },
      { type: "help_article", slug: draftSlug, title: "Draft", body: "Secret", publishedAt: null },
      {
        type: "help_article",
        slug: futureSlug,
        title: "Future",
        body: "Soon",
        publishedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      {
        type: "help_article",
        slug: orderA,
        title: "A",
        sortOrder: 1,
        publishedAt: new Date("2025-01-01"),
      },
      {
        type: "help_article",
        slug: orderB,
        title: "B",
        sortOrder: 2,
        publishedAt: new Date("2025-01-02"),
      },
      {
        type: "help_article",
        slug: orderC,
        title: "C",
        sortOrder: 2,
        publishedAt: new Date("2025-06-01"),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(contentEntries).where(inArray(contentEntries.slug, allSlugs));
    await moduleRef.close();
  });

  it("lists only published entries", async () => {
    const list = await service.list("help_article");
    const slugs = list.map((entry) => entry.slug);
    expect(slugs).toContain(publishedSlug);
    expect(slugs).not.toContain(draftSlug);
  });

  it("excludes an entry whose publishedAt is in the future", async () => {
    const list = await service.list("help_article");
    expect(list.map((entry) => entry.slug)).not.toContain(futureSlug);
    await expect(service.get("help_article", futureSlug)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("orders by sortOrder ascending, then publishedAt newest first", async () => {
    const list = await service.list("help_article");
    const mine = [];
    for (const entry of list) {
      if ([orderA, orderB, orderC].includes(entry.slug)) {
        mine.push(entry.slug);
      }
    }
    expect(mine).toEqual([orderA, orderC, orderB]);
  });

  it("returns a published entry with its body", async () => {
    const entry = await service.get("help_article", publishedSlug);
    expect(entry.body).toBe("Hello");
  });

  it("throws NotFoundException for an unpublished or missing slug", async () => {
    await expect(service.get("help_article", draftSlug)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get("help_article", "nope-nope")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("throws BadRequestException for an unknown type", async () => {
    await expect(service.list("nonsense")).rejects.toBeInstanceOf(BadRequestException);
  });
  it("binned entries are not public", async () => {
    const slug = `bin-${randomUUID().slice(0, 8)}`;
    await db.insert(contentEntries).values({
      type: "help_article",
      slug,
      title: "Binned",
      body: "Gone",
      publishedAt: new Date("2026-01-01"),
      deletedAt: new Date(),
    });
    try {
      const list = await service.list("help_article");
      expect(list.some((entry) => entry.slug === slug)).toBe(false);
      await expect(service.get("help_article", slug)).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await db.delete(contentEntries).where(inArray(contentEntries.slug, [slug]));
    }
  });
});
