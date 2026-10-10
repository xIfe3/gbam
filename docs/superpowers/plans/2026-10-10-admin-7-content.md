# Admin Phase 7 (Content editor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins edit help articles, FAQs, blog posts, changelog, legal pages and the marketing pages' text from the admin area. They work on a draft, preview it, publish now or later, unpublish, and restore any earlier published version, all without a deploy.

**Architecture:** Each `content_entries` row keeps its live fields (what the public reads, unchanged) plus a `draft` jsonb. Edits write the draft, Preview shows it, and Publish copies it into the live fields and saves a `content_versions` row. Marketing pages are entries of a new type, `marketing_page`. Their fields are typed per page in `@gbam/shared`, and the web pages fall back to today's text until something is published. `sync-content` becomes insert-only, so the database is the master copy.

**Tech Stack:** NestJS 12, Drizzle, R2 (existing PhotoStorage) for images, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-design.md` section 7.

## Global Constraints

- CLAUDE.md code style.
- `content.edit` to create and edit drafts, upload images, and bin or restore entries. `content.publish` to publish, schedule, unpublish and restore a version. Everything is audited.
- Status is worked out: `draft` (publishedAt null), `scheduled` (publishedAt in the future), `published`. An entry can be published and also have unpublished draft changes.
- Public endpoints never return the draft and never return binned entries.
- Marketing pages that can be edited: home, features, pricing, about, how-it-works, use-cases, mission, security. Fields: SEO description; header (eyebrow, title, lead, photo src and alt, button label); home also has its hero lines and subtitle; features also has its tiles (eyebrow, title, text). Defaults are today's text.
- Web pages read marketing fields with a 60-second cache; an API failure falls back to the defaults.

## Review Focus

1. Editing a published entry → the public page doesn't change until Publish. (Task 2 test `draft edits don't reach the public`.)
2. Publishing twice, then restoring version 1 → the draft becomes version 1's text; live is unchanged until published. (Task 2 test.)
3. sync-content on a database where an admin edited an entry → the edit is kept. (Task 1 test `sync never overwrites`.)
4. A marketing page whose saved fields fail its schema (an older shape) → the page falls back to defaults for those fields, it doesn't crash. (Task 4 test.)
5. Admin with `content.edit` but not `content.publish` → can save drafts, can't publish (403). (Task 2 test.)

---

### Task 1: Tables and insert-only sync

`content_entries`: add `draft` (jsonb, null = no unpublished changes), `seo_description`, `deleted_at`; add `marketing_page` to `content_type`. `content_versions`: id, entry_id (cascade), version number, title, summary, body, data, category, seo_description, published_by (admin, set null), created_at. `upsertContent` → insert-only (`onConflictDoNothing`). Public content service excludes binned entries.

**Tests:** `sync never overwrites`; `sync adds missing entries`; `binned entries are not public`.

### Task 2: Admin content API

`apps/api/src/admin/content-admin.service.ts` and controller: `GET /admin/content?type&status&category&q&bin`, `POST /admin/content` (new draft), `GET /admin/content/:id` (live, draft, versions), `PATCH /admin/content/:id/draft`, `POST /admin/content/:id/publish {at?}`, `POST /admin/content/:id/unpublish`, `GET /admin/content/:id/versions/:versionId`, `POST /admin/content/:id/versions/:versionId/restore` (into the draft), `POST /admin/content/:id/delete|restore`, `POST /admin/content/images` (multipart, R2).

**Tests:** `needs content.edit / content.publish`; `draft edits don't reach the public`; `publish copies the draft and saves a version`; `publish at a later time is scheduled`; `unpublish hides it`; `restore a version into the draft`; `slug clash is refused`; `image upload returns a URL`.

### Task 3: Admin web: content list and editor

`/admin/content` (filters, bin), `/admin/content/new`, `/admin/content/[id]`: Markdown textarea with a toolbar (bold, link, heading, list, image upload) and live preview (the site's Prose renderer); title, slug (new only), summary, category, sort order, SEO description; legal entries edit their sections (heading, text, short version); publish now or at a time; unpublish; versions list with side-by-side compare and restore; bin.

### Task 4: Marketing pages

`packages/shared/src/marketing.ts`: a Zod schema and defaults per page. API: `GET /content/marketing/:page` (public, published fields merged over defaults). Web pages read them through `lib/marketing.ts` (60-second cache, defaults on failure). Admin: `/admin/content/marketing/[page]` form generated from the page's fields, with the same draft, publish and versions as Task 2 (entries of type `marketing_page`, created on first save).

**Tests:** `defaults until published`; `published fields shown`; `bad saved fields fall back`; `form saves a draft and publishes`.
