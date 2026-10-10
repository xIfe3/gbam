import { describe, expect, it } from "vitest";
import { contentDraftSchema, legalSectionSchema, newContentSchema } from "./content";

const draft = {
  title: "How payouts work",
  summary: null,
  body: "Payouts arrive the next working day.",
  category: "Payments",
  sortOrder: 0,
  seoDescription: null,
  data: null,
};

describe("content schemas", () => {
  it("a draft needs a title", () => {
    expect(contentDraftSchema.safeParse({ ...draft, title: " " }).success).toBe(false);
    expect(contentDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("a slug is lowercase words joined by dashes", () => {
    const base = { ...draft, type: "help_article" };
    expect(newContentSchema.safeParse({ ...base, slug: "how-payouts-work" }).success).toBe(true);
    expect(newContentSchema.safeParse({ ...base, slug: "How Payouts" }).success).toBe(false);
    expect(newContentSchema.safeParse({ ...base, slug: "-payouts" }).success).toBe(false);
    expect(newContentSchema.safeParse({ ...base, slug: "x", type: "marketing_page" }).success).toBe(
      false,
    );
  });

  it("a legal section needs an id, a heading and text", () => {
    expect(
      legalSectionSchema.safeParse({ id: "who-we-are", heading: "Who we are", body: "Gbam is..." })
        .success,
    ).toBe(true);
    expect(
      legalSectionSchema.safeParse({ id: "Who We Are", heading: "x", body: "y" }).success,
    ).toBe(false);
  });
});
