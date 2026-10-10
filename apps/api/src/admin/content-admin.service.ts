import { adminUsers, contentEntries, contentVersions, type DbTransaction } from "@gbam/db";
import {
  isMarketingPage,
  legalSectionSchema,
  MARKETING_DEFAULTS,
  MARKETING_PAGE_LABELS,
  MARKETING_SCHEMAS,
  type ContentDraft,
  type ContentStatus,
  type NewContentInput,
  type PublishContentInput,
} from "@gbam/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  desc,
  eq,
  gt,
  ilike,
  isNotNull,
  isNull,
  lte,
  max,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isUniqueViolation } from "../common/db-errors.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { InjectPhotoStorage, type PhotoStorage } from "../integrations/integrations.module.js";
import { processPhoto, UnsupportedPhotoError } from "../products/photo-processing.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";

type EntryRow = typeof contentEntries.$inferSelect;

export type ContentListQuery = {
  type?: string;
  status?: ContentStatus;
  category?: string;
  q?: string;
  bin: boolean;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** draft: never published (or unpublished); scheduled: goes live later; published: live. */
export function statusOf(publishedAt: Date | null, now: Date): ContentStatus {
  if (publishedAt === null) {
    return "draft";
  }
  if (publishedAt.getTime() > now.getTime()) {
    return "scheduled";
  }
  return "published";
}

/** The fields a draft and a version hold, taken from an entry's live columns. */
function liveFields(entry: EntryRow): ContentDraft {
  let data: Record<string, unknown> | null = null;
  if (entry.data && typeof entry.data === "object") {
    data = entry.data as Record<string, unknown>;
  }
  return {
    title: entry.title,
    summary: entry.summary,
    body: entry.body,
    category: entry.category,
    sortOrder: entry.sortOrder,
    seoDescription: entry.seoDescription,
    data,
  };
}

/**
 * Extra fields are checked by kind: a marketing page's against that page's fields, a legal
 * page's sections one by one. So nothing broken can be saved or published.
 */
function checkData(type: string, slug: string, data: ContentDraft["data"]) {
  if (type === "marketing_page") {
    if (!isMarketingPage(slug) || !MARKETING_SCHEMAS[slug].safeParse(data).success) {
      throw new BadRequestException("Some of the page's fields are missing or too long");
    }
    return;
  }
  if (type !== "legal" || data === null || data.sections === undefined) {
    return;
  }
  const sections = z.array(legalSectionSchema).max(60).safeParse(data.sections);
  if (!sections.success) {
    throw new BadRequestException("A legal section is missing its id, heading or text");
  }
}

/**
 * The content editor: help articles, FAQs, blog, changelog, legal pages, and marketing pages.
 * Edits go into each entry's draft; publishing copies the draft into the live columns (what
 * the public reads) and keeps a numbered version.
 */
@Injectable()
export class ContentAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectPhotoStorage() private readonly storage: PhotoStorage,
    private readonly audit: AuditService,
  ) {}

  async list(query: ContentListQuery) {
    const now = new Date();
    const conditions: SQL[] = [];
    if (query.bin) {
      conditions.push(isNotNull(contentEntries.deletedAt));
    } else {
      conditions.push(isNull(contentEntries.deletedAt));
    }
    if (query.type) {
      conditions.push(eq(contentEntries.type, query.type as EntryRow["type"]));
    } else {
      // Marketing pages have their own screen.
      conditions.push(ne(contentEntries.type, "marketing_page"));
    }
    if (query.status === "draft") {
      conditions.push(isNull(contentEntries.publishedAt));
    } else if (query.status === "scheduled") {
      conditions.push(gt(contentEntries.publishedAt, now));
    } else if (query.status === "published") {
      conditions.push(lte(contentEntries.publishedAt, now));
    }
    if (query.category) {
      conditions.push(eq(contentEntries.category, query.category));
    }
    if (query.q && query.q.trim() !== "") {
      const pattern = `%${query.q.trim()}%`;
      const match = or(ilike(contentEntries.title, pattern), ilike(contentEntries.slug, pattern));
      if (match) {
        conditions.push(match);
      }
    }
    const rows = await this.db
      .select()
      .from(contentEntries)
      .where(and(...conditions))
      .orderBy(desc(contentEntries.updatedAt))
      .limit(200);
    const list = [];
    for (const row of rows) {
      let title = row.title;
      const draft = row.draft as ContentDraft | null;
      if (draft) {
        title = draft.title;
      }
      list.push({
        id: row.id,
        type: row.type,
        slug: row.slug,
        title,
        category: row.category,
        status: statusOf(row.publishedAt, now),
        hasDraft: row.draft !== null,
        updatedAt: row.updatedAt,
      });
    }
    return list;
  }

  async detail(id: string) {
    const entry = await this.findAny(id);
    const versions = await this.db
      .select({
        id: contentVersions.id,
        version: contentVersions.version,
        createdAt: contentVersions.createdAt,
        publishedByName: adminUsers.name,
      })
      .from(contentVersions)
      .leftJoin(adminUsers, eq(adminUsers.id, contentVersions.publishedBy))
      .where(eq(contentVersions.entryId, id))
      .orderBy(desc(contentVersions.version));
    return {
      entry: { ...entry, status: statusOf(entry.publishedAt, new Date()) },
      versions,
    };
  }

  /** A new entry starts as a draft (not public until it's published). */
  async create(input: NewContentInput, admin: AdminContext, ip: string | null) {
    checkData(input.type, input.slug, input.data);
    const draft: ContentDraft = {
      title: input.title,
      summary: input.summary,
      body: input.body,
      category: input.category,
      sortOrder: input.sortOrder,
      seoDescription: input.seoDescription,
      data: input.data,
    };
    try {
      return await this.db.transaction(async (tx) => {
        const rows = await tx
          .insert(contentEntries)
          .values({ type: input.type, slug: input.slug, ...draft, draft, publishedAt: null })
          .returning({ id: contentEntries.id });
        const row = rows[0];
        if (!row) {
          throw new Error("Failed to save the entry");
        }
        await this.record(tx, admin, "content.create", row.id, ip);
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error, "content_entries_type_slug_uq")) {
        throw new ConflictException("There's already one with that web address (slug)");
      }
      throw error;
    }
  }

  /** Saves the draft. The public keeps seeing the published version until Publish. */
  async saveDraft(id: string, draft: ContentDraft, admin: AdminContext, ip: string | null) {
    const entry = await this.find(id);
    checkData(entry.type, entry.slug, draft.data);
    await this.db.transaction(async (tx) => {
      await tx.update(contentEntries).set({ draft }).where(eq(contentEntries.id, id));
      await this.record(tx, admin, "content.edit", id, ip);
    });
    return { ok: true };
  }

  /**
   * Publish now or at a time: the draft (if any) becomes the live text, and a numbered
   * version of what went live is kept.
   */
  async publish(id: string, input: PublishContentInput, admin: AdminContext, ip: string | null) {
    const entry = await this.find(id);
    let at = new Date();
    let action = "content.publish";
    if (input.at) {
      at = new Date(input.at);
      if (at.getTime() <= Date.now()) {
        throw new BadRequestException("Pick a time in the future, or publish now");
      }
      action = "content.schedule";
    }
    let fields = liveFields(entry);
    const draft = entry.draft as ContentDraft | null;
    if (draft) {
      fields = draft;
    }
    checkData(entry.type, entry.slug, fields.data);

    await this.db.transaction(async (tx) => {
      // Lock the row so two admins publishing at once can't take the same version number.
      await tx.select().from(contentEntries).where(eq(contentEntries.id, id)).for("update");
      const latest = await tx
        .select({ value: max(contentVersions.version) })
        .from(contentVersions)
        .where(eq(contentVersions.entryId, id));
      let next = 1;
      const current = latest[0]?.value;
      if (current !== null && current !== undefined) {
        next = current + 1;
      }
      await tx
        .update(contentEntries)
        .set({ ...fields, publishedAt: at, draft: null })
        .where(eq(contentEntries.id, id));
      await tx.insert(contentVersions).values({
        entryId: id,
        version: next,
        title: fields.title,
        summary: fields.summary,
        body: fields.body,
        data: fields.data,
        category: fields.category,
        seoDescription: fields.seoDescription,
        publishedBy: admin.id,
      });
      await this.record(tx, admin, action, id, ip);
    });
    return { ok: true };
  }

  /** Takes it off the site. Its text stays, so it can be published again. */
  async unpublish(id: string, admin: AdminContext, ip: string | null) {
    await this.find(id);
    await this.db.transaction(async (tx) => {
      await tx.update(contentEntries).set({ publishedAt: null }).where(eq(contentEntries.id, id));
      await this.record(tx, admin, "content.unpublish", id, ip);
    });
    return { ok: true };
  }

  async version(id: string, versionId: string) {
    const rows = await this.db
      .select()
      .from(contentVersions)
      .where(and(eq(contentVersions.id, versionId), eq(contentVersions.entryId, id)));
    const version = rows[0];
    if (!version) {
      throw new NotFoundException("No such version");
    }
    return version;
  }

  /** Copies an old version into the draft; it goes live only when published again. */
  async restoreVersion(id: string, versionId: string, admin: AdminContext, ip: string | null) {
    const entry = await this.find(id);
    const version = await this.version(id, versionId);
    let data: Record<string, unknown> | null = null;
    if (version.data && typeof version.data === "object") {
      data = version.data as Record<string, unknown>;
    }
    const draft: ContentDraft = {
      title: version.title,
      summary: version.summary,
      body: version.body,
      category: version.category,
      sortOrder: entry.sortOrder,
      seoDescription: version.seoDescription,
      data,
    };
    await this.db.transaction(async (tx) => {
      await tx.update(contentEntries).set({ draft }).where(eq(contentEntries.id, id));
      await this.record(tx, admin, "content.restore_version", id, ip);
    });
    return { ok: true };
  }

  /** Into the bin (off the site at once; restorable for 30 days). */
  async remove(id: string, admin: AdminContext, ip: string | null) {
    await this.find(id);
    await this.setBin(id, new Date(), "content.delete", admin, ip);
    return { ok: true };
  }

  async restore(id: string, admin: AdminContext, ip: string | null) {
    await this.findAny(id);
    await this.setBin(id, null, "content.restore", admin, ip);
    return { ok: true };
  }

  /**
   * The entry behind a marketing page, made on first use with today's words (published, so
   * nothing on the site changes). Returns its id, for the usual draft and publish screens.
   */
  async openMarketing(page: string, admin: AdminContext, ip: string | null) {
    if (!isMarketingPage(page)) {
      throw new NotFoundException("No such page");
    }
    const existing = await this.db
      .select({ id: contentEntries.id })
      .from(contentEntries)
      .where(and(eq(contentEntries.type, "marketing_page"), eq(contentEntries.slug, page)));
    const found = existing[0];
    if (found) {
      return found;
    }
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(contentEntries)
        .values({
          type: "marketing_page",
          slug: page,
          title: `${MARKETING_PAGE_LABELS[page]} page`,
          body: "",
          data: MARKETING_DEFAULTS[page],
          publishedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: contentEntries.id });
      let row = rows[0];
      if (!row) {
        // Opened at the same moment by someone else: use theirs.
        const again = await tx
          .select({ id: contentEntries.id })
          .from(contentEntries)
          .where(and(eq(contentEntries.type, "marketing_page"), eq(contentEntries.slug, page)));
        row = again[0];
      }
      if (!row) {
        throw new Error("Failed to open the marketing page");
      }
      await this.record(tx, admin, "content.create", row.id, ip);
      return row;
    });
  }

  /** A photo for an article: resized like product photos, stored on R2, its address returned. */
  async uploadImage(file: { buffer: Buffer; size: number }) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException("Images can be up to 10 MB");
    }
    let processed;
    try {
      processed = await processPhoto(file.buffer);
    } catch (error) {
      if (error instanceof UnsupportedPhotoError) {
        throw new BadRequestException("We can't read this image. Try a JPEG or PNG.");
      }
      throw error;
    }
    const key = `content/${randomUUID()}.webp`;
    await this.storage.put(key, processed.large, "image/webp");
    return { url: this.storage.publicUrl(key) };
  }

  private async setBin(
    id: string,
    deletedAt: Date | null,
    action: string,
    admin: AdminContext,
    ip: string | null,
  ) {
    await this.db.transaction(async (tx) => {
      await tx.update(contentEntries).set({ deletedAt }).where(eq(contentEntries.id, id));
      await this.record(tx, admin, action, id, ip);
    });
  }

  private async record(
    tx: DbTransaction,
    admin: AdminContext,
    action: string,
    id: string,
    ip: string | null,
  ) {
    await this.audit.record(
      { adminId: admin.id, action, targetType: "content", targetId: id, ip },
      tx,
    );
  }

  /** An entry that isn't in the bin, or 404. */
  async find(id: string): Promise<EntryRow> {
    const entry = await this.findAny(id);
    if (entry.deletedAt !== null) {
      throw new NotFoundException("No such entry");
    }
    return entry;
  }

  private async findAny(id: string): Promise<EntryRow> {
    const rows = await this.db.select().from(contentEntries).where(eq(contentEntries.id, id));
    const entry = rows[0];
    if (!entry) {
      throw new NotFoundException("No such entry");
    }
    return entry;
  }
}
