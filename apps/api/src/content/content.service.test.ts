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
    ]);
  });

  afterAll(async () => {
    await db.delete(contentEntries).where(inArray(contentEntries.slug, [publishedSlug, draftSlug]));
    await moduleRef.close();
  });

  it("lists only published entries", async () => {
    const list = await service.list("help_article");
    const slugs = list.map((entry) => entry.slug);
    expect(slugs).toContain(publishedSlug);
    expect(slugs).not.toContain(draftSlug);
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
});
