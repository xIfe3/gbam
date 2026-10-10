/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { adminAuditLog, contentEntries } from "@gbam/db";
import { MARKETING_DEFAULTS, type MarketingFields } from "@gbam/shared";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContentModule } from "../content/content.module.js";
import { ContentService } from "../content/content.service.js";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { PHOTO_STORAGE } from "../integrations/integrations.module.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

type Detail = {
  entry: {
    id: string;
    title: string;
    body: string;
    status: string;
    publishedAt: string | null;
    draft: { title: string; body: string } | null;
  };
  versions: { id: string; version: number }[];
};

describe("Admin content API (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let publicContent: ContentService;
  let editor: TestAdmin;
  let publisher: TestAdmin;
  let outsider: TestAdmin;
  const stored: string[] = [];
  const ids: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, AdminModule, ContentModule],
    })
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .overrideProvider(PHOTO_STORAGE)
      .useValue({
        put: async (key: string) => {
          stored.push(key);
        },
        delete: async () => undefined,
        publicUrl: (key: string) => `https://photos.test/${key}`,
      })
      .compile();
    app = moduleRef.createNestApplication();
    baseUrl = await listen(app);
    db = moduleRef.get(DB);
    publicContent = moduleRef.get(ContentService);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    editor = await data.admin({ isSuperadmin: false, roleId: await data.role(["content.edit"]) });
    publisher = await data.admin({
      isSuperadmin: false,
      roleId: await data.role(["content.edit", "content.publish"]),
    });
    outsider = await data.admin({ isSuperadmin: false, roleId: await data.role(["shops.view"]) });
  });

  afterAll(async () => {
    if (ids.length > 0) {
      await db.delete(adminAuditLog).where(inArray(adminAuditLog.targetId, ids));
      await db.delete(contentEntries).where(inArray(contentEntries.id, ids));
    }
    await data.cleanUp();
    await app.close();
  });

  const fields = (title: string, body: string) => ({
    title,
    summary: null,
    body,
    category: "Payments",
    sortOrder: 0,
    seoDescription: "How payouts reach your bank",
    data: null,
  });

  async function newEntry(token = publisher.token): Promise<{ id: string; slug: string }> {
    const slug = `payouts-${randomUUID().slice(0, 8)}`;
    const result = await callAdmin(baseUrl, "POST", "/admin/content", token, {
      ...fields("How payouts work", "Version one"),
      type: "help_article",
      slug,
    });
    expect(result.status).toBe(201);
    const id = (result.json as { id: string }).id;
    ids.push(id);
    return { id, slug };
  }

  const detail = async (id: string) =>
    (await callAdmin(baseUrl, "GET", `/admin/content/${id}`, publisher.token)).json as Detail;

  it("needs content.edit / content.publish", async () => {
    expect((await callAdmin(baseUrl, "GET", "/admin/content", outsider.token)).status).toBe(403);
    const { id } = await newEntry(editor.token);
    const publish = await callAdmin(
      baseUrl,
      "POST",
      `/admin/content/${id}/publish`,
      editor.token,
      {},
    );
    expect(publish.status).toBe(403);
  });

  it("publish copies the draft and saves a version", async () => {
    const { id, slug } = await newEntry();
    // Not public yet: a new entry is a draft.
    await expect(publicContent.get("help_article", slug)).rejects.toThrow();
    const result = await callAdmin(
      baseUrl,
      "POST",
      `/admin/content/${id}/publish`,
      publisher.token,
      {},
    );
    expect(result.status).toBe(200);
    const live = await publicContent.get("help_article", slug);
    expect(live.body).toBe("Version one");
    const after = await detail(id);
    expect(after.entry.status).toBe("published");
    expect(after.entry.draft).toBeNull();
    expect(after.versions.map((version) => version.version)).toEqual([1]);
    const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, id));
    expect(audit.map((entry) => entry.action).sort()).toEqual([
      "content.create",
      "content.publish",
    ]);
  });

  it("draft edits don't reach the public", async () => {
    const { id, slug } = await newEntry();
    await callAdmin(baseUrl, "POST", `/admin/content/${id}/publish`, publisher.token, {});
    const save = await callAdmin(baseUrl, "PATCH", `/admin/content/${id}/draft`, editor.token, {
      ...fields("How payouts work", "Version two, not yet live"),
    });
    expect(save.status).toBe(200);
    expect((await publicContent.get("help_article", slug)).body).toBe("Version one");
    expect((await detail(id)).entry.draft?.body).toBe("Version two, not yet live");
  });

  it("publish at a later time is scheduled", async () => {
    const { id, slug } = await newEntry();
    const at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await callAdmin(baseUrl, "POST", `/admin/content/${id}/publish`, publisher.token, { at });
    expect((await detail(id)).entry.status).toBe("scheduled");
    await expect(publicContent.get("help_article", slug)).rejects.toThrow();
  });

  it("unpublish hides it", async () => {
    const { id, slug } = await newEntry();
    await callAdmin(baseUrl, "POST", `/admin/content/${id}/publish`, publisher.token, {});
    const result = await callAdmin(
      baseUrl,
      "POST",
      `/admin/content/${id}/unpublish`,
      publisher.token,
    );
    expect(result.status).toBe(200);
    await expect(publicContent.get("help_article", slug)).rejects.toThrow();
    expect((await detail(id)).entry.status).toBe("draft");
  });

  it("restore a version into the draft", async () => {
    const { id, slug } = await newEntry();
    await callAdmin(baseUrl, "POST", `/admin/content/${id}/publish`, publisher.token, {});
    await callAdmin(baseUrl, "PATCH", `/admin/content/${id}/draft`, editor.token, {
      ...fields("How payouts work", "Version two"),
    });
    await callAdmin(baseUrl, "POST", `/admin/content/${id}/publish`, publisher.token, {});
    const versions = (await detail(id)).versions;
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    const first = versions.find((version) => version.version === 1);
    const one = await callAdmin(
      baseUrl,
      "GET",
      `/admin/content/${id}/versions/${first?.id}`,
      publisher.token,
    );
    expect((one.json as { body: string }).body).toBe("Version one");
    const restore = await callAdmin(
      baseUrl,
      "POST",
      `/admin/content/${id}/versions/${first?.id}/restore`,
      publisher.token,
    );
    expect(restore.status).toBe(200);
    const after = await detail(id);
    expect(after.entry.draft?.body).toBe("Version one");
    // Live stays version two until it's published again.
    expect((await publicContent.get("help_article", slug)).body).toBe("Version two");
  });

  it("slug clash is refused", async () => {
    const { slug } = await newEntry();
    const again = await callAdmin(baseUrl, "POST", "/admin/content", publisher.token, {
      ...fields("Another", "x"),
      type: "help_article",
      slug,
    });
    expect(again.status).toBe(409);
  });

  it("filters and the bin", async () => {
    const { id } = await newEntry();
    const drafts = (
      await callAdmin(baseUrl, "GET", "/admin/content?type=help_article&status=draft", editor.token)
    ).json as { id: string }[];
    expect(drafts.some((row) => row.id === id)).toBe(true);
    expect(
      (await callAdmin(baseUrl, "POST", `/admin/content/${id}/delete`, editor.token)).status,
    ).toBe(200);
    const list = (await callAdmin(baseUrl, "GET", "/admin/content", editor.token)).json as {
      id: string;
    }[];
    expect(list.some((row) => row.id === id)).toBe(false);
    const bin = (await callAdmin(baseUrl, "GET", "/admin/content?bin=1", editor.token)).json as {
      id: string;
    }[];
    expect(bin.some((row) => row.id === id)).toBe(true);
    expect(
      (await callAdmin(baseUrl, "POST", `/admin/content/${id}/restore`, editor.token)).status,
    ).toBe(200);
  });

  it("image upload returns a URL", async () => {
    // A tiny real PNG (1×1 pixel), so the resizing step has something it can read.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const form = new FormData();
    form.set("image", new Blob([png], { type: "image/png" }), "pixel.png");
    const res = await fetch(`${baseUrl}/admin/content/images`, {
      method: "POST",
      headers: { "x-admin-token": editor.token },
      body: form,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { url: string };
    expect(body.url).toMatch(/^https:\/\/photos\.test\/content\/.+\.webp$/);
    expect(stored).toHaveLength(1);
  });
  /** The mission page's headline as the public sees it. */
  async function missionTitle(): Promise<string> {
    const fields = (await publicContent.marketing("mission")) as MarketingFields<"mission">;
    return fields.header.title;
  }

  it("marketing pages: defaults until published, then the published fields", async () => {
    // A test of its own page's row: remove any leftover so it starts from the defaults.
    await db.delete(contentEntries).where(eq(contentEntries.type, "marketing_page"));
    const before = await publicContent.marketing("mission");
    expect(before).toEqual(MARKETING_DEFAULTS.mission);

    const opened = await callAdmin(
      baseUrl,
      "POST",
      "/admin/content/marketing/mission",
      editor.token,
    );
    expect(opened.status).toBe(200);
    const id = (opened.json as { id: string }).id;
    ids.push(id);
    // Opening it twice gives the same entry.
    const again = await callAdmin(
      baseUrl,
      "POST",
      "/admin/content/marketing/mission",
      editor.token,
    );
    expect((again.json as { id: string }).id).toBe(id);

    const header = { ...MARKETING_DEFAULTS.mission.header, title: "Selling made calm" };
    const save = await callAdmin(baseUrl, "PATCH", `/admin/content/${id}/draft`, editor.token, {
      ...fields("Mission", ""),
      data: { ...MARKETING_DEFAULTS.mission, header },
    });
    expect(save.status).toBe(200);
    // Not live until published.
    expect(await missionTitle()).toBe(MARKETING_DEFAULTS.mission.header.title);
    await callAdmin(baseUrl, "POST", `/admin/content/${id}/publish`, publisher.token, {});
    expect(await missionTitle()).toBe("Selling made calm");
    await db.delete(contentEntries).where(eq(contentEntries.id, id));
  });

  it("a marketing draft must fit the page's fields", async () => {
    await db.delete(contentEntries).where(eq(contentEntries.type, "marketing_page"));
    const opened = await callAdmin(baseUrl, "POST", "/admin/content/marketing/about", editor.token);
    const id = (opened.json as { id: string }).id;
    ids.push(id);
    const bad = await callAdmin(baseUrl, "PATCH", `/admin/content/${id}/draft`, editor.token, {
      ...fields("About", ""),
      data: { seoDescription: "", header: { title: "x" } },
    });
    expect(bad.status).toBe(400);
    expect(
      (await callAdmin(baseUrl, "POST", "/admin/content/marketing/nope", editor.token)).status,
    ).toBe(404);
    await db.delete(contentEntries).where(eq(contentEntries.id, id));
  });
  it("opening a marketing page doesn't pin today's words", async () => {
    await db.delete(contentEntries).where(eq(contentEntries.type, "marketing_page"));
    const opened = await callAdmin(baseUrl, "POST", "/admin/content/marketing/security", editor.token);
    const id = (opened.json as { id: string }).id;
    ids.push(id);
    // Nothing saved: the page keeps following the defaults in code, even if they change later.
    const rows = await db.select().from(contentEntries).where(eq(contentEntries.id, id));
    expect(rows[0]?.data).toBeNull();
    // And publishing with nothing saved is fine (it means "the defaults").
    const publish = await callAdmin(baseUrl, "POST", `/admin/content/${id}/publish`, publisher.token, {});
    expect(publish.status).toBe(200);
    await db.delete(contentEntries).where(eq(contentEntries.id, id));
  });
});
