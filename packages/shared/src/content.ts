import { z } from "zod";

/** The kinds of written content the admin content editor handles (marketing pages are separate). */
export const EDITABLE_CONTENT_TYPES = [
  "help_article",
  "faq",
  "blog_post",
  "changelog",
  "legal",
] as const;
export type EditableContentType = (typeof EDITABLE_CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<EditableContentType, string> = {
  help_article: "Help article",
  faq: "FAQ",
  blog_post: "Blog post",
  changelog: "Changelog",
  legal: "Legal page",
};

/** Worked out from the publish date: none = draft, in the future = scheduled. */
export const CONTENT_STATUSES = ["draft", "scheduled", "published"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** One section of a legal page: the full text, and the plain-words "short version". */
export const legalSectionSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,60}$/, "Use lowercase letters, numbers and dashes"),
  heading: z.string().trim().min(1, "Write a heading").max(150),
  body: z.string().trim().min(1, "Write the section").max(20_000),
  short: z.string().trim().max(300).optional(),
});
export type LegalSection = z.output<typeof legalSectionSchema>;

/**
 * What an editor saves: the draft of one entry. `data` holds extra fields (a legal page's
 * sections, its "last updated" date...); it's checked further per type by the API.
 */
export const contentDraftSchema = z.object({
  title: z.string().trim().min(1, "Write a title").max(200),
  summary: z.string().trim().max(500).nullable(),
  body: z.string().max(100_000),
  category: z.string().trim().max(60).nullable(),
  sortOrder: z.int().min(0).max(10_000),
  seoDescription: z.string().trim().max(300).nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
});
export type ContentDraft = z.output<typeof contentDraftSchema>;

/** A new entry: its type and web address (slug) are chosen once and never change. */
export const newContentSchema = contentDraftSchema.extend({
  type: z.enum(EDITABLE_CONTENT_TYPES),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and dashes, like how-payouts-work",
    )
    .max(80),
});
export type NewContentInput = z.output<typeof newContentSchema>;

/** Publish now (no time) or at a later time. */
export const publishContentSchema = z.object({
  at: z.iso.datetime({ offset: true }).optional(),
});
export type PublishContentInput = z.output<typeof publishContentSchema>;
