import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { adminApiMock, FakeApiError, refresh } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    adminApiMock: {
      createContent: vi.fn(),
      saveContentDraft: vi.fn(),
      publishContent: vi.fn(),
      uploadContentImage: vi.fn(),
    },
    FakeApiError,
    refresh: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({
  unstable_rethrow: () => undefined,
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("@/lib/api", () => ({ ApiError: FakeApiError }));

import { draftFromForm } from "@/components/admin/content-form";
import {
  createContentAction,
  publishContentAction,
  saveContentDraftAction,
  uploadContentImageAction,
} from "./content-actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const FIELDS = {
  title: "How payouts work",
  summary: "",
  body: "Payouts arrive the next working day.",
  category: "Payments",
  sortOrder: "3",
  seoDescription: "",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reading the editor form", () => {
  it("empty boxes become null, the order a number, legal sections come from data", () => {
    expect(draftFromForm(form(FIELDS))).toEqual({
      title: "How payouts work",
      summary: null,
      body: "Payouts arrive the next working day.",
      category: "Payments",
      sortOrder: 3,
      seoDescription: null,
      data: null,
    });
    const legal = draftFromForm(
      form({
        ...FIELDS,
        data: JSON.stringify({ sections: [{ id: "a", heading: "A", body: "Text" }] }),
      }),
    );
    expect(legal.data).toEqual({ sections: [{ id: "a", heading: "A", body: "Text" }] });
  });
});

describe("content actions", () => {
  it("new entry saves and opens it", async () => {
    adminApiMock.createContent.mockResolvedValue({ id: "c1" });
    await expect(
      createContentAction({}, form({ ...FIELDS, type: "help_article", slug: "how-payouts-work" })),
    ).rejects.toThrow("NEXT_REDIRECT:/admin/content/c1");
    expect(adminApiMock.createContent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "help_article", slug: "how-payouts-work", sortOrder: 3 }),
    );
  });

  it("a bad slug is caught before the API", async () => {
    const state = await createContentAction({}, form({ ...FIELDS, type: "faq", slug: "Bad Slug" }));
    expect(state.fieldErrors?.slug).toBeDefined();
    expect(adminApiMock.createContent).not.toHaveBeenCalled();
  });

  it("saving a draft says it isn't live yet", async () => {
    adminApiMock.saveContentDraft.mockResolvedValue({ ok: true });
    const state = await saveContentDraftAction("c1", {}, form(FIELDS));
    expect(adminApiMock.saveContentDraft).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ sortOrder: 3 }),
    );
    expect(state.notice).toContain("not live");
  });

  it("publish at a time is sent as Lagos time", async () => {
    adminApiMock.publishContent.mockResolvedValue({ ok: true });
    await publishContentAction("c1", {}, form({ at: "2026-10-12T09:00" }));
    expect(adminApiMock.publishContent).toHaveBeenCalledWith("c1", {
      at: "2026-10-12T09:00:00+01:00",
    });
    await publishContentAction("c1", {}, form({ at: "" }));
    expect(adminApiMock.publishContent).toHaveBeenLastCalledWith("c1", {});
  });

  it("an uploaded image comes back as Markdown to paste in", async () => {
    adminApiMock.uploadContentImage.mockResolvedValue({
      url: "https://photos.test/content/a.webp",
    });
    const data = new FormData();
    data.set("image", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    const result = await uploadContentImageAction(data);
    expect(result).toEqual({ url: "https://photos.test/content/a.webp" });
    const empty = await uploadContentImageAction(new FormData());
    expect(empty.error).toBeDefined();
  });
});
