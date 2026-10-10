import { contentEntries } from "@gbam/db";
import { isMarketingPage, resolveMarketing } from "@gbam/shared";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

// The public content types (the content_type enum in @gbam/db, minus marketing_page, which
// has its own endpoint).
export const CONTENT_TYPES = ["help_article", "faq", "blog_post", "changelog", "legal"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Narrows a URL string to a known content type, or answers 400. */
function parseType(type: string): ContentType {
  for (const known of CONTENT_TYPES) {
    if (known === type) {
      return known;
    }
  }
  throw new BadRequestException(`Unknown content type: ${type}`);
}

@Injectable()
export class ContentService {
  constructor(@InjectDb() private readonly db: Db) {}

  /** Published entries of one type: by sortOrder, then newest first. */
  async list(type: string) {
    const kind = parseType(type);
    return this.db
      .select({
        slug: contentEntries.slug,
        title: contentEntries.title,
        summary: contentEntries.summary,
        category: contentEntries.category,
        sortOrder: contentEntries.sortOrder,
        publishedAt: contentEntries.publishedAt,
      })
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.type, kind),
          isNotNull(contentEntries.publishedAt),
          lte(contentEntries.publishedAt, new Date()),
          // Not in the admin's bin.
          isNull(contentEntries.deletedAt),
        ),
      )
      .orderBy(asc(contentEntries.sortOrder), desc(contentEntries.publishedAt));
  }

  async get(type: string, slug: string) {
    const kind = parseType(type);
    const [entry] = await this.db
      .select({
        slug: contentEntries.slug,
        title: contentEntries.title,
        summary: contentEntries.summary,
        category: contentEntries.category,
        sortOrder: contentEntries.sortOrder,
        publishedAt: contentEntries.publishedAt,
        body: contentEntries.body,
        data: contentEntries.data,
      })
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.type, kind),
          eq(contentEntries.slug, slug),
          isNotNull(contentEntries.publishedAt),
          lte(contentEntries.publishedAt, new Date()),
          // Not in the admin's bin.
          isNull(contentEntries.deletedAt),
        ),
      );
    if (!entry) {
      throw new NotFoundException("Content not found");
    }
    return entry;
  }

  /** A marketing page's fields: what's published, and today's defaults for anything else. */
  async marketing(page: string) {
    if (!isMarketingPage(page)) {
      throw new NotFoundException("No such page");
    }
    const [entry] = await this.db
      .select({ data: contentEntries.data })
      .from(contentEntries)
      .where(
        and(
          eq(contentEntries.type, "marketing_page"),
          eq(contentEntries.slug, page),
          isNotNull(contentEntries.publishedAt),
          lte(contentEntries.publishedAt, new Date()),
          isNull(contentEntries.deletedAt),
        ),
      );
    let saved: unknown = null;
    if (entry) {
      saved = entry.data;
    }
    return resolveMarketing(page, saved);
  }
}
