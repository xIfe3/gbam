import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ refresh }) };
});
vi.mock("@/lib/api", () => ({
  api: { listContent: vi.fn().mockResolvedValue([]), getContent: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import BlogLoading from "./blog/loading";
import BlogPostLoading from "./blog/[slug]/loading";
import BlogPage from "./blog/page";
import ChangelogLoading from "./changelog/loading";
import ChangelogPage from "./changelog/page";
import { ContentUnavailable } from "./content-unavailable";
import FaqLoading from "./faq/loading";
import FaqPage from "./faq/page";
import HelpLoading from "./help/loading";
import HelpArticleLoading from "./help/[slug]/loading";
import HelpPage from "./help/page";
import LegalLoading from "../legal/[doc]/loading";

describe("public content empty states", () => {
  it("blog with no posts", async () => {
    render(await BlogPage());
    expect(screen.getByRole("heading", { name: "No posts yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /see how gbam works/i })).toHaveAttribute(
      "href",
      "/how-it-works",
    );
  });

  it("changelog with nothing listed", async () => {
    render(await ChangelogPage());
    expect(screen.getByRole("heading", { name: "Nothing new yet" })).toBeInTheDocument();
  });

  it("help centre with no articles", async () => {
    render(await HelpPage());
    expect(screen.getByRole("heading", { name: "No articles here yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@gbam.app" })).toHaveAttribute(
      "href",
      "mailto:support@gbam.app",
    );
  });

  it("FAQ with nothing loaded", async () => {
    render(await FaqPage());
    expect(screen.getByRole("heading", { name: "No questions here yet" })).toBeInTheDocument();
  });
});

describe("content that fails to load", () => {
  it("offers Try again, which reloads the page data", () => {
    render(<ContentUnavailable what="Blog posts" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Blog posts couldn't load");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
  });
});

describe("public loading screens", () => {
  const SCREENS = [
    { name: "help centre", Screen: HelpLoading, text: "Loading help articles…" },
    { name: "help article", Screen: HelpArticleLoading, text: "Loading the article…" },
    { name: "blog", Screen: BlogLoading, text: "Loading the blog…" },
    { name: "blog post", Screen: BlogPostLoading, text: "Loading the post…" },
    { name: "faq", Screen: FaqLoading, text: "Loading questions…" },
    { name: "changelog", Screen: ChangelogLoading, text: "Loading updates…" },
    { name: "legal", Screen: LegalLoading, text: "Loading the document…" },
  ];
  for (const { name, Screen, text } of SCREENS) {
    it(`${name} announces itself`, () => {
      render(<Screen />);
      expect(screen.getByRole("status")).toHaveTextContent(text);
    });
  }
});
