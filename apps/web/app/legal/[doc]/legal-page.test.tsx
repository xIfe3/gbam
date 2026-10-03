import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LEGAL_DOCS } from "@/lib/site-nav";

const { getContent, notFound } = vi.hoisted(() => ({
  getContent: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api error");
    }
  }
  return { ApiError, api: { getContent } };
});

import { ApiError } from "@/lib/api";
import LegalDocPage from "./page";

const entry = {
  slug: "privacy",
  title: "Privacy Policy",
  summary: "How we handle data.",
  category: null,
  sortOrder: 1,
  date: "2026-10-03",
  body: "",
  data: {
    lastUpdated: "2026-10-03",
    sections: [
      {
        id: "what-we-store",
        heading: "What we store",
        body: "We store **your name**.",
        short: "Only what we need.",
      },
      {
        id: "your-rights",
        heading: "Your rights",
        body: "You can ask for a copy.",
        short: "You are in control.",
      },
    ],
  },
};

async function renderDoc(doc: string) {
  render(await LegalDocPage({ params: Promise.resolve({ doc }) } as never));
}

describe("legal document page", () => {
  beforeEach(() => {
    getContent.mockReset();
  });

  it("renders tabs, contents list, short versions, date and draft notice", async () => {
    getContent.mockResolvedValue(entry);
    await renderDoc("privacy");

    const tabs = screen.getByRole("navigation", { name: "Legal documents" });
    expect(within(tabs).getAllByRole("link")).toHaveLength(LEGAL_DOCS.length);
    const current = within(tabs).getByRole("link", { current: "page" });
    expect(current).toHaveAttribute("href", "/legal/privacy");

    const toc = screen.getByRole("navigation", { name: "On this page" });
    const links = within(toc).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["#what-we-store", "#your-rights"]);

    expect(screen.getByText("Only what we need.")).toBeInTheDocument();
    expect(screen.getByText("You are in control.")).toBeInTheDocument();
    expect(screen.getAllByText(/Short version/)).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "What we store" })).toHaveAttribute(
      "id",
      "what-we-store",
    );
    expect(screen.getByText("Last updated 3 October 2026")).toBeInTheDocument();
    expect(screen.getByText("This is a draft pending legal review.")).toBeInTheDocument();
  });

  it("hides the contents list when there are no sections", async () => {
    getContent.mockResolvedValue({ ...entry, data: { lastUpdated: "2026-10-03", sections: [] } });
    await renderDoc("privacy");
    expect(screen.queryByRole("navigation", { name: "On this page" })).not.toBeInTheDocument();
  });

  it("shows a friendly error when the API is down", async () => {
    getContent.mockRejectedValue(new Error("network"));
    await renderDoc("privacy");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("calls notFound on a 404", async () => {
    getContent.mockRejectedValue(new ApiError(404, {}));
    await expect(renderDoc("privacy")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound for a doc outside LEGAL_DOCS without hitting the API", async () => {
    await expect(renderDoc("nonsense")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(getContent).not.toHaveBeenCalled();
  });
});
