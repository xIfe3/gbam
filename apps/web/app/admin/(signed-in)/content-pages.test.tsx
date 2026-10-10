import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { adminApiMock } = vi.hoisted(() => ({
  adminApiMock: {
    me: vi.fn(),
    contentList: vi.fn(),
    contentEntry: vi.fn(),
    contentVersion: vi.fn(),
  },
}));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  unstable_rethrow: () => undefined,
}));
// The pages only hand these actions to forms and buttons; they never run in these tests.
vi.mock("./content-actions", () => ({
  createContentAction: vi.fn(),
  saveContentDraftAction: vi.fn(),
  publishContentAction: vi.fn(),
  unpublishContentAction: vi.fn(),
  deleteContentAction: vi.fn(),
  restoreContentAction: vi.fn(),
  restoreVersionAction: vi.fn(),
  uploadContentImageAction: vi.fn(),
}));

import ContentEntryPage from "./content/[id]/page";
import VersionPage from "./content/[id]/versions/[versionId]/page";
import ContentPage from "./content/page";

const ID = "6f1c1f0e-2b7a-4d61-9a5e-2f5a1c9b0d11";
const VERSION = "7a2c1f0e-2b7a-4d61-9a5e-2f5a1c9b0d22";

function me(permissions: string[]) {
  return {
    id: "a1",
    name: "Chika",
    email: "c@x.com",
    isSuperadmin: false,
    role: null,
    permissions,
  };
}

const ENTRY = {
  entry: {
    id: ID,
    type: "help_article",
    slug: "how-payouts-work",
    title: "How payouts work",
    summary: null,
    body: "Version one",
    category: "Payments",
    sortOrder: 0,
    seoDescription: null,
    data: null,
    publishedAt: "2026-10-01T08:00:00Z",
    deletedAt: null,
    status: "published",
    draft: {
      title: "How payouts work",
      summary: null,
      body: "Version two",
      category: "Payments",
      sortOrder: 0,
      seoDescription: null,
      data: null,
    },
  },
  versions: [
    { id: VERSION, version: 1, createdAt: "2026-10-01T08:00:00Z", publishedByName: "Chika" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  adminApiMock.contentEntry.mockResolvedValue(ENTRY);
});

describe("Content list", () => {
  it("lists entries with status and unpublished changes", async () => {
    adminApiMock.contentList.mockResolvedValue([
      {
        id: ID,
        type: "help_article",
        slug: "how-payouts-work",
        title: "How payouts work",
        category: "Payments",
        status: "published",
        hasDraft: true,
        updatedAt: "2026-10-09T08:00:00Z",
      },
    ]);
    render(await ContentPage({ searchParams: Promise.resolve({ type: "help_article" }) }));
    expect(adminApiMock.contentList).toHaveBeenCalledWith(
      expect.objectContaining({ type: "help_article" }),
    );
    const row = screen.getByRole("row", { name: /How payouts work/ });
    expect(row).toHaveTextContent("Published");
    expect(row).toHaveTextContent("Unpublished changes");
    expect(within(row).getByRole("link", { name: "How payouts work" })).toHaveAttribute(
      "href",
      `/admin/content/${ID}`,
    );
  });
});

describe("Content entry", () => {
  it("the editor opens on the draft; a publisher sees publish controls and versions", async () => {
    adminApiMock.me.mockResolvedValue(me(["content.edit", "content.publish"]));
    render(await ContentEntryPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("textbox", { name: "Text (Markdown)" })).toHaveValue("Version two");
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Version 1/ })).toHaveAttribute(
      "href",
      `/admin/content/${ID}/versions/${VERSION}`,
    );
  });

  it("an editor without content.publish can save but not publish", async () => {
    adminApiMock.me.mockResolvedValue(me(["content.edit"]));
    render(await ContentEntryPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });

  it("a version is shown next to the current draft", async () => {
    adminApiMock.me.mockResolvedValue(me(["content.edit", "content.publish"]));
    adminApiMock.contentVersion.mockResolvedValue({
      id: VERSION,
      version: 1,
      title: "How payouts work",
      summary: null,
      body: "Version one",
      data: null,
      category: "Payments",
      seoDescription: null,
      createdAt: "2026-10-01T08:00:00Z",
    });
    render(await VersionPage({ params: Promise.resolve({ id: ID, versionId: VERSION }) }));
    const older = screen.getByRole("region", { name: "Version 1" });
    expect(older).toHaveTextContent("Version one");
    const current = screen.getByRole("region", { name: "Now (draft)" });
    expect(current).toHaveTextContent("Version two");
    expect(screen.getByRole("button", { name: "Restore this version" })).toBeInTheDocument();
  });
});
