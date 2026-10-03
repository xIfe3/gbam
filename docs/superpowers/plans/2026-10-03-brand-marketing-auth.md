# Brand, Marketing Site, Legal Pages & Seller Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Gbam its brand, a ~20-page marketing/help/legal site, and real seller accounts (email + password, verification codes, automatic Paystack subaccounts), replacing the dev-only login.

**Architecture:** Everything public lives in the existing Next.js app (`apps/web`) using route groups; the NestJS API (`apps/api`) owns users, sessions, email codes, content and payouts. Editable content (help, FAQ, blog, changelog, legal) is stored in a `content_entries` table seeded from Markdown files. The browser never calls the API directly: the Next server forwards the `gbam_session` cookie as a Bearer token.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`, `next/font`), Tailwind CSS 4, NestJS 12 (ESM), Drizzle + Postgres, BullMQ, Resend, Paystack, Vitest, `@node-rs/argon2`, `react-markdown`, `gray-matter`, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-10-03-brand-marketing-auth-design.md` (read it; mockups in `docs/superpowers/specs/2026-10-03-brand-marketing-auth-mockups/`).

## Global Constraints

- Follow `CLAUDE.md` plain-code rules: async/await + try/catch, if/else over ternaries (trivial JSX ternaries allowed), for-loops over `reduce`, no `!` assertions, no `??=`, a short comment wherever a concept may be new.
- Colours only via theme tokens: `brand #13804F`, `brand-hover #0F6B42`, `brand-tint #DCEFE5`, `coral #FF7A6B`, `coral-deep #C9473A`, `coral-tint #FFD2C9`, `coral-wash #FFF0EC`, `blush #FFF8F5`, `ink #132A20`, `ink-muted #3B4B43`, `ink-subtle #6B7A72`. Coral is never small text on blush; use `coral-deep`.
- Fonts: Fraunces (headlines, big numbers, "Gbam.") + DM Sans (UI) via `next/font/google`.
- Every page works at 360px wide with no horizontal scroll; tap targets ≥ 44px; visible focus rings.
- No fabricated testimonials, ratings, user counts or seller logos anywhere.
- Fees on any page come from `PLATFORM_FEE`, `calculatePlatformFee`, `estimatePaystackFee` (`@gbam/shared`), never hard-coded numbers.
- Domain `gbam.app`; emails `hello@gbam.app`, `support@gbam.app`, `privacy@gbam.app`; operator "Zephra Studios (registration pending)" with placeholders `[RC number]`, `[Registered address]`.
- Integration settings optional in dev (fakes), required when `NODE_ENV=production`: `RESEND_API_KEY`, `EMAIL_FROM` (default `Gbam <no-reply@gbam.app>`).
- Run `pnpm turbo run build typecheck lint test` before every commit; commit only if 18/18 (plus new) tasks pass and nothing is skipped.

## Review Focus

1. **Email typed with capitals or spaces** (`" Ada@Example.com "`) at signup, then lowercase at login: must log in. Test in Task 11.
2. **Signup with an email, phone or slug that already exists** (including two tabs submitting at once): friendly field error (409), never a 500. Test in Task 11.
3. **Expired or revoked session cookie** on a dashboard page: redirect to `/login?next=…`, not an error page. Test in Task 13.
4. **Content Markdown containing raw HTML / `<script>`**: rendered as text or stripped, never executed. Test in Task 2.
5. **Wrong bank account number** in onboarding: a field error, and no subaccount or seller update saved. Test in Task 14.

---

## File map

```
packages/db/src/schema.ts                     + users, sessions, email_codes, contact_messages, content_entries, sellers columns
packages/db/src/content-loader.ts             read packages/db/content/**/*.md → rows
packages/db/content/{help_article,faq,blog_post,changelog,legal}/*.md
packages/integrations/src/email.ts            EmailClient, ResendEmailClient, FakeEmailClient
packages/integrations/src/paystack.ts         + listBanks, resolveAccount, createSubaccount
apps/api/src/common/rate-limiter.ts           Redis fixed-window limiter
apps/api/src/email/                           queue, processor, templates
apps/api/src/content/                         read-only endpoints
apps/api/src/contact/                         POST /contact
apps/api/src/auth/                            crypto helpers, AuthService, AuthController, SessionGuard
apps/api/src/payouts/                         banks, resolve, create subaccount
apps/web/app/globals.css, layout.tsx          tokens + fonts
apps/web/components/brand/*                   shared components
apps/web/lib/site-nav.ts                      single source of header/footer links
apps/web/lib/session.ts                       cookie helpers
apps/web/proxy.ts                             protect /dashboard
apps/web/app/(marketing)/**, legal/[doc], (auth)/**, dashboard/**, [slug]/**
apps/web/vitest.config.ts + *.test.tsx        web tests (jsdom)
```

---

## Step 1: Brand system

### Task 1: Tokens, fonts, logo, icon, web test setup

**Files:**

- Modify: `apps/web/app/globals.css`, `apps/web/app/layout.tsx`, `apps/web/package.json`
- Create: `apps/web/components/brand/logo.tsx`, `apps/web/app/icon.tsx`, `apps/web/vitest.config.ts`, `apps/web/components/brand/logo.test.tsx`

**Interfaces:**

- Produces: Tailwind utilities `bg-brand`, `text-coral-deep`, `bg-blush`, … for every token in Global Constraints; `font-display` (Fraunces) and `font-sans` (DM Sans); `<Logo size?: "sm" | "md" | "lg" variant?: "default" | "on-dark" />`; `<LogoIcon size: number />` ("g!" tile).

- [ ] **Step 1:** Add dev deps to web: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`; add `"test": "vitest run"`; `vitest.config.ts` with `environment: "jsdom"` and the `@/` alias.
- [ ] **Step 2: Write the failing test** `logo.test.tsx`: renders `<Logo />`; `getByLabelText("Gbam")` exists; the "!" element has class `text-coral`; `variant="on-dark"` renders the word in `text-white`.
- [ ] **Step 3:** Run `pnpm --filter @gbam/web test` → FAIL (module not found).
- [ ] **Step 4:** Implement tokens in `@theme` (replace the old `brand-50/600/700`), fonts in `layout.tsx` (CSS variables `--font-display`, `--font-sans`), `Logo`/`LogoIcon` as inline SVG/text with `aria-label="Gbam"`, `app/icon.tsx` via `ImageResponse` (green tile, white "g", coral "!").
- [ ] **Step 5:** Update existing pages that use `brand-600/700/50` to the new token names. Run `pnpm --filter @gbam/web test` and `pnpm turbo run build typecheck lint` → PASS.
- [ ] **Step 6:** Commit `feat(web): brand tokens, fonts and logo`.

### Task 2: Shared brand components + site navigation

**Files:**

- Create in `apps/web/components/brand/`: `button.tsx`, `fields.tsx` (TextField, PasswordField, CodeInput), `photo.tsx`, `phone-mockup.tsx`, `payment-toast.tsx`, `bento.tsx`, `cta-band.tsx`, `pill-tabs.tsx`, `short-version.tsx`, `prose.tsx`, `header.tsx`, `footer.tsx`, `page-header.tsx` (split header: eyebrow, title, lead, photo)
- Create: `apps/web/lib/site-nav.ts`
- Test: `apps/web/components/brand/prose.test.tsx`, `photo.test.tsx`, `apps/web/lib/site-nav.test.ts`

**Interfaces:**

- Produces:
  - `HEADER_LINKS`, `FOOTER_GROUPS: { title: string; links: { href: string; label: string }[] }[]` in `site-nav.ts` (every route from spec 3.1–3.2).
  - `<Button href? variant: "primary" | "secondary" | "ghost" size?: "md" | "lg">`
  - `<Photo description: string src?: string alt?: string className? />` (no `src` → branded placeholder showing the description)
  - `<PhoneMockup>{children}</PhoneMockup>`, `<PaymentToast amountKobo: number code: string />`
  - `<BentoGrid>`, `<BentoTile eyebrow title tint?: "white" | "brand" | "coral" span?: 1 | 2>`
  - `<CtaBand />`, `<PillTabs items: { href; label }[] activeHref />`, `<ShortVersion>{text}</ShortVersion>`
  - `<Prose markdown: string />` using `react-markdown` with `skipHtml`
  - `<PageHeader eyebrow title lead photo: { description: string; src?: string } cta? />`

- [ ] **Step 1: Write failing tests:**
  - `prose.test.tsx`: markdown `"# Hi\n\n<script>alert(1)</script>\n\n**bold**"` renders an `h1` "Hi" and `strong` "bold"; `container.querySelector("script")` is `null`; the text `alert(1)` is not in the DOM.
  - `photo.test.tsx`: without `src` renders text "food vendor at her stall" and `role="img"` with that `aria-label`; with `src` renders `<img alt>`.
  - `site-nav.test.ts`: every `href` in `HEADER_LINKS` and `FOOTER_GROUPS` starting with `/` has a matching `page.tsx` under `apps/web/app` (resolve route groups and `[doc]`/`[slug]` segments by reading the filesystem; legal hrefs match `legal/[doc]` and a known doc slug list exported as `LEGAL_DOCS` from `site-nav.ts`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add deps `react-markdown`, `lucide-react`; implement components (`Header` has a mobile menu button with `aria-expanded`; `Footer` renders `FOOTER_GROUPS` + "© {year} Gbam · A product of Zephra Studios"). `site-nav.test` stays failing for pages not built yet: mark it `it.todo` for unbuilt routes by listing them in `PENDING_ROUTES` inside the test, and remove entries as later tasks build each page.
- [ ] **Step 4:** Run tests → PASS. Build/typecheck/lint → PASS.
- [ ] **Step 5:** Commit `feat(web): shared brand components and site navigation`.

---

## Step 2: Home page

### Task 3: Home page

**Files:**

- Create: `apps/web/app/(marketing)/layout.tsx` (Header + Footer), `apps/web/app/(marketing)/page.tsx`, `apps/web/app/(marketing)/home/*.tsx` (one file per section: `hero.tsx`, `how-it-works.tsx`, `features.tsx`, `sellers-collage.tsx`, `pricing-teaser.tsx`, `faq-highlights.tsx`)
- Delete: `apps/web/app/page.tsx`
- Test: `apps/web/app/(marketing)/home/hero.test.tsx`

**Interfaces:**

- Consumes: Task 2 components; `formatNaira`, `PLATFORM_FEE` from `@gbam/shared`.

- [ ] **Step 1: Failing test** `hero.test.tsx`: renders `h1` containing "Sell on WhatsApp." and "Gbam."; link "Start selling free" → `/signup`; link "See how it works" → `/how-it-works`; text "Payment received" and "₦6,000"; trust line "Free for founding sellers · No app to install · Payments by Paystack".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Build the hero exactly per mockup `home-hero.html` (centered headline, two stacked photos + one tall photo each side, `PhoneMockup` with the GB-7K3Q order chat, `PaymentToast` ₦6,000 at the phone's top-right, "🛵 3 orders out for delivery" card lower-left; side photos hidden below `md`). Then the sections in order from spec 3.1. Pricing teaser text built from `PLATFORM_FEE` ("1.5% per paid order, never more than ₦1,000"). FAQ highlights: 4 static Q&As linking to `/faq`.
- [ ] **Step 4:** Run tests, build → PASS. Remove `/` from `PENDING_ROUTES`.
- [ ] **Step 5:** Write `docs/photo-shortlist.md`: one row per `<Photo description>` used on the site so far (later tasks append theirs), each with 2 candidate Unsplash/Pexels page links and the licence name, for the owner to approve. Photos are only downloaded into `apps/web/public/photos/` after approval.
- [ ] **Step 6:** Commit `feat(web): home page`.

---

## Step 3: Marketing pages and content

### Task 4: Database: all new tables (one migration) + content loader

**Files:**

- Modify: `packages/db/src/schema.ts`, `packages/db/src/seed.ts`, `packages/db/package.json` (dep `gray-matter`)
- Create: `packages/db/src/content-loader.ts`, `packages/db/src/content-loader.test.ts`, `packages/db/content/` (folders per type with one sample file each), `packages/db/vitest.config.ts`
- Generated: `packages/db/migrations/0004_*.sql`

**Interfaces:**

- Produces (exported from `@gbam/db`): tables `users`, `sessions`, `emailCodes`, `contactMessages`, `contentEntries`; enums `userRoleEnum ('seller','admin')`, `emailCodePurposeEnum ('verify_email','reset_password')`, `contactStatusEnum ('new','handled')`, `contentTypeEnum ('help_article','faq','blog_post','changelog','legal')`; `sellers` gains `ownerUserId` (unique, nullable for now), `bankName`, `accountLast4`, `bankAccountName`. Columns exactly as spec section 5.
- Produces: `loadContentFiles(rootDir: string): Promise<ContentFile[]>` where `ContentFile = { type; slug; title; summary: string | null; body: string; data: Record<string, unknown> | null; category: string | null; sortOrder: number; publishedAt: Date | null }`; `upsertContent(db: Db, files: ContentFile[]): Promise<number>`.

- [ ] **Step 1: Failing test** `content-loader.test.ts` (temp dir fixtures): a file `help_article/getting-started.md` with frontmatter `title`, `summary`, `category`, `sortOrder: 2`, `published: true` → one `ContentFile` with `type "help_article"`, `slug "getting-started"`, body without frontmatter, `publishedAt` a Date; `published: false` → `publishedAt null`; a folder name that isn't a content type throws `Unknown content type "x"`; a file missing `title` throws naming the file.
- [ ] **Step 2:** Run `pnpm --filter @gbam/db test` → FAIL.
- [ ] **Step 3:** Add tables/columns; implement loader with `gray-matter`; `upsertContent` uses `onConflictDoUpdate` on `(type, slug)`. Seed calls `upsertContent(db, await loadContentFiles(contentDir))` and prints the count.
- [ ] **Step 4:** `pnpm db:generate` → one migration; `pnpm db:migrate`; `pnpm db:seed` prints "Seeded N content entries"; tests PASS.
- [ ] **Step 5:** Commit `feat(db): auth, contact and content tables with markdown content loader`.

### Task 5: Content API + marketing pages

**Files:**

- Create: `apps/api/src/content/content.module.ts`, `content.service.ts`, `content.controller.ts`, `content.service.test.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/web/lib/api.ts` (add `listContent`, `getContent`)
- Create pages: `apps/web/app/(marketing)/{features,how-it-works,pricing,use-cases,about,mission,security}/page.tsx`, `apps/web/app/(marketing)/pricing/fee-calculator.tsx` (client), `fee-calculator.test.tsx`

**Interfaces:**

- Produces API: `GET /content/:type` → `ContentSummary[]` (`{ slug; title; summary; category; sortOrder; publishedAt }`, published only, sorted by `sortOrder` then `publishedAt desc`); `GET /content/:type/:slug` → `ContentEntryDto` (summary fields + `body` + `data`), 404 if unpublished or missing; 400 for an unknown type.
- Produces web: `api.listContent(type)`, `api.getContent(type, slug)`.

- [ ] **Step 1: Failing tests:**
  - `content.service.test.ts` (integration): seeds two `help_article` rows, one unpublished → list returns only the published one; `get` of the unpublished slug throws `NotFoundException`.
  - `fee-calculator.test.tsx`: entering ₦10,000 shows gbam fee "₦150", Paystack fee "₦250", "You receive ₦9,600"; ₦200,000 shows gbam fee "₦1,000" (cap).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement module and pages. Each page uses `PageHeader` + `BentoGrid` + `CtaBand` with copy from spec 3.1. `/how-it-works` uses numbered steps with `PhoneMockup` screens. Calculator uses `calculatePlatformFee(kobo, null)` and `estimatePaystackFee(kobo)`.
- [ ] **Step 4:** Tests + build PASS; remove these routes from `PENDING_ROUTES`.
- [ ] **Step 5:** Commit `feat: content API and marketing pages`.

### Task 6: Help centre, FAQ, blog, changelog + starter content

**Files:**

- Create pages: `apps/web/app/(marketing)/help/page.tsx`, `help/[slug]/page.tsx`, `help/help-search.tsx` (client), `faq/page.tsx`, `blog/page.tsx`, `blog/[slug]/page.tsx`, `changelog/page.tsx`
- Create content: `packages/db/content/help_article/*.md` (≥ 8: create shop, share link, request payment, get paid/payouts, order statuses, WhatsApp messages, reset password, delete account), `faq/*.md` (≥ 10, `category` set), `blog_post/*.md` (2–3), `changelog/*.md` (entries for each shipped phase)
- Test: `apps/web/app/(marketing)/help/help-search.test.tsx`

- [ ] **Step 1: Failing test** `help-search.test.tsx`: given 3 article summaries, typing "pay" shows only titles/summaries containing "pay" (case-insensitive); empty query shows all grouped by category; no match shows "No articles match "xyz". Try "payment" or contact support@gbam.app."
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement pages reading from the content API (`generateMetadata` from entry title/summary; unknown slug → `notFound()`). Write the content files (plain, accurate to current behaviour; no claims about unbuilt features).
- [ ] **Step 4:** `pnpm db:seed`; tests + build PASS; remove routes from `PENDING_ROUTES`.
- [ ] **Step 5:** Commit `feat: help centre, FAQ, blog and changelog`.

### Task 7: Email sending (integration + queue)

**Files:**

- Create: `packages/integrations/src/email.ts`, `email.test.ts`; `apps/api/src/email/{email.module.ts,email.queue.ts,email.processor.ts,templates.ts,templates.test.ts}`
- Modify: `packages/integrations/src/index.ts`, `apps/api/src/env.ts` (`RESEND_API_KEY`, `EMAIL_FROM`; production-required), `apps/api/src/integrations/integrations.module.ts` (provide `EMAIL`), `apps/api/src/worker.module.ts`, `.env.example`

**Interfaces:**

- Produces: `interface EmailClient { send(input: { to: string; subject: string; text: string; html: string; replyTo?: string }): Promise<{ id: string }> }`, `ResendEmailClient(apiKey: string, from: string)` (POST `https://api.resend.com/emails`), `FakeEmailClient(log)` (logs `[fake email] → to: subject` and the text).
- Produces: `EmailQueue.send(job: EmailJob)` where `EmailJob = { kind: "verify_email"; to; code } | { kind: "reset_password"; to; code } | { kind: "contact_message"; name; email; phone: string | null; message }`; `renderEmail(job): { to; subject; text; html; replyTo? }` (contact goes to `hello@gbam.app` with `replyTo` = sender).

- [ ] **Step 1: Failing tests:** `templates.test.ts`: verify email subject "Your Gbam code: 123456", text contains "123456" and "expires in 15 minutes"; contact message `to` is `hello@gbam.app`, `replyTo` is the sender, and user text with `<b>` is HTML-escaped in `html`. `email.test.ts`: `ResendEmailClient` sends Bearer key and the JSON body (stub `fetch` with `vi.stubGlobal`), throws `EmailError` with Resend's message on non-2xx.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Queue: 5 attempts, exponential backoff, `jobId` = caller-provided id (`code-<emailCodeId>` / `contact-<messageId>`).
- [ ] **Step 4:** Tests + build PASS.
- [ ] **Step 5:** Commit `feat: email sending via Resend with queue and fake`.

### Task 8: Rate limiter + contact form

**Files:**

- Create: `apps/api/src/common/rate-limiter.ts`, `rate-limiter.test.ts`; `apps/api/src/contact/{contact.module.ts,contact.controller.ts,contact.service.ts,contact.service.test.ts}`; `packages/shared/src/schemas.ts` (+ `contactMessageSchema`); `apps/web/app/(marketing)/contact/{page.tsx,contact-form.tsx,actions.ts}`

**Interfaces:**

- Produces: `RateLimiter.hit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>` (Redis `INCR` + `EXPIRE` on first hit); `TooManyRequestsError` → mapped to HTTP 429 `{ message: "Too many attempts, try again in N minutes", retryAfterSeconds }` by `DomainErrorsFilter`.
- Produces: `contactMessageSchema = { name 1–120, email (z.email, trimmed, lowercased), phone optional nigerianPhoneSchema, message 10–3000 }`; `POST /contact` → 201 `{ received: true }`; limit 5 per hour per IP.

- [ ] **Step 1: Failing tests:** `rate-limiter.test.ts` (Redis db 1): 3 hits with limit 3 allowed, the 4th not, with `retryAfterSeconds` between 1 and the window; a different key is independent. `contact.service.test.ts`: valid message stored with status `new` and an email job queued; 6th submission from same IP within the hour → `TooManyRequestsError`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; contact page per template with the form (server action keeps typed values on error), WhatsApp link, and the three emails.
- [ ] **Step 4:** Tests + build PASS; remove `/contact` from `PENDING_ROUTES`.
- [ ] **Step 5:** Commit `feat: rate limiting and contact form`.

---

## Step 4: Legal pages

### Task 9: Legal template + seven documents

**Files:**

- Create: `apps/web/app/legal/[doc]/page.tsx`, `apps/web/app/legal/layout.tsx`, `apps/web/components/brand/legal-toc.tsx`; `packages/db/content/legal/{terms,privacy,cookies,refunds,seller-agreement,acceptable-use,data-deletion}.md`
- Test: `apps/web/app/legal/[doc]/legal-page.test.tsx`

**Interfaces:**

- Consumes: `LEGAL_DOCS` (Task 2), `api.getContent("legal", slug)`. Legal frontmatter `data.sections: { id: string; heading: string; body: string; short: string }[]`, `data.lastUpdated: "YYYY-MM-DD"`.

- [ ] **Step 1: Failing test:** rendering a legal entry with 2 sections shows pill tabs for all 7 `LEGAL_DOCS` with the current one marked `aria-current="page"`, an "On this page" list linking to `#<section.id>`, each section's "Short version" note, "Last updated 3 October 2026", and the notice "This is a draft pending legal review."
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the template (mockup option B) and write the documents: NDPA 2023 rights (access, correction, deletion, objection, portability, complaint to the NDPC), processors (Paystack, Meta/WhatsApp, Resend, hosting), what we store (seller account, customer name/phone/order data, no card data), retention, essential cookie only (`gbam_session`), refunds handled seller-to-customer with Gbam's fee policy, seller obligations, prohibited goods, data-deletion steps (email `privacy@gbam.app` or account deletion request; 30 days). Operator placeholders as in Global Constraints.
- [ ] **Step 4:** `pnpm db:seed`; tests + build PASS; all `/legal/*` out of `PENDING_ROUTES`.
- [ ] **Step 5:** Commit `feat: legal pages`.

---

## Step 5: Auth

### Task 10: Auth crypto helpers

**Files:**

- Create: `apps/api/src/auth/crypto.ts`, `crypto.test.ts`; add dep `@node-rs/argon2` to api
- Modify: `packages/shared/src/schemas.ts` (+ `signupSchema`, `loginSchema`, `emailSchema`, `passwordSchema`, `codeSchema`)

**Interfaces:**

- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(hash: string, password: string): Promise<boolean>`, `newSessionToken(): string` (32 random bytes, base64url), `hashToken(token: string): string` (sha256 hex), `newEmailCode(): string` (6 digits, zero-padded, `crypto.randomInt`).
- Produces (`@gbam/shared`): `emailSchema` (trim + lowercase + `z.email()`), `passwordSchema` (min 8, max 200), `codeSchema` (`/^\d{6}$/`), `signupSchema = { businessName 1–120, slug: slugSchema, phone: nigerianPhoneSchema, email: emailSchema, password: passwordSchema }`, `loginSchema = { email, password }`, and their types `SignupInput = z.output<typeof signupSchema>`, `LoginInput = z.output<typeof loginSchema>`.

- [ ] **Step 1: Failing tests:** hash ≠ password and `verifyPassword` true/false correctly; two tokens differ and are 43 chars; `hashToken` is stable and 64 hex chars; 1,000 `newEmailCode()` calls all match `/^\d{6}$/`; `emailSchema.parse(" Ada@Example.com ")` is `"ada@example.com"` (Review Focus 1).
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(auth): password, token and code helpers`.

### Task 11: Auth API: signup, verify, resend

**Files:**

- Create: `apps/api/src/auth/{auth.module.ts,auth.service.ts,auth.controller.ts,auth.service.test.ts}`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**

- Consumes: Task 10 helpers, `EmailQueue` (Task 7), `RateLimiter` (Task 8).
- Produces:
  - `AuthService.signup(input: SignupInput, meta: { ip; userAgent }): Promise<{ sessionToken: string; user: PublicUser }>`: one transaction creates `users` (role seller), `sellers` (`ownerUserId`, `slug`, `businessName`, `whatsappPhone`), session; then queues a verify code. Duplicate email/slug/phone → `ConflictException({ field: "email" | "slug" | "phone", message })`.
  - `AuthService.slugAvailable(slug): Promise<{ available: boolean; reason?: "taken" | "reserved" | "invalid" }>`
  - `AuthService.verifyEmail(userId, code): Promise<void>`: 15-min expiry, max 5 attempts, marks `consumed_at` and `email_verified_at`; wrong/expired → `BadRequestException({ field: "code", message })`.
  - `AuthService.resendCode(userId, purpose): Promise<void>`: 60-second cooldown (429 via `TooManyRequestsError`), invalidates previous codes.
  - `PublicUser = { id; email; emailVerified: boolean; role; seller: { id; slug; businessName; hasPayoutAccount: boolean } | null }`.
  - Routes: `POST /auth/signup` → `{ sessionToken, user }`; `GET /auth/slug-available?slug=` (limit 30/min/IP); `POST /auth/verify-email`; `POST /auth/resend-code` (last two need a session: Task 12 guard; until then accept `userId` from the session lookup helper added here as `AuthService.userFromToken(token)`).

- [ ] **Step 1: Failing tests** (integration): signup creates user+seller+session and queues `verify_email`; signup with `" Ada@Example.com "` stores `ada@example.com`; second signup with same email → `ConflictException` field `email`; same for slug and phone; **two signups with the same email in `Promise.allSettled` → exactly one fulfilled, the other `ConflictException` (not a raw DB error)** (Review Focus 2); correct code verifies; wrong code 5 times then even the right code fails; expired code (set `expires_at` in the past) fails; resend within 60s → `TooManyRequestsError`; reserved slug "dashboard" → `{ available: false, reason: "reserved" }`.
- [ ] **Step 2–4:** FAIL → implement (catch unique violations with the existing `isUniqueViolation` pattern; move that helper to `apps/api/src/common/db-errors.ts` and reuse it) → PASS.
- [ ] **Step 5:** Commit `feat(auth): signup, email verification and resend`.

### Task 12: Auth API: login, logout, forgot/reset, me + SessionGuard (remove dev login)

**Files:**

- Create: `apps/api/src/auth/session.guard.ts`, `apps/api/src/auth/current-user.ts`
- Modify: `auth.service.ts`, `auth.controller.ts`, `auth.service.test.ts`, `apps/api/src/orders/orders.controller.ts`, `apps/api/src/products/products.module.ts`, orders/payments tests as needed, `packages/db/src/seed.ts`
- Delete: `apps/api/src/common/seller.guard.ts`

**Interfaces:**

- Produces: `AuthService.login(email, password, meta)`: wrong password increments `failed_login_count`; at 5 sets `locked_until = now + 15 min`; locked → `TooManyRequestsError`; success resets counter and returns `{ sessionToken, user }`. `logout(token)`, `forgotPassword(email)` (always resolves; queues code only if user exists), `resetPassword(email, code, newPassword)` (deletes all sessions, returns a new `{ sessionToken, user }`), `me(token): PublicUser`.
- Produces: `SessionGuard` reads `Authorization: Bearer`, loads session (not expired), refreshes `expires_at` (+30 days) and `last_used_at` at most once per day, attaches `request.user: PublicUser`; 401 otherwise. Option `@AllowUnverified()` for verify/resend/me/logout; all other guarded routes return 403 `{ code: "EMAIL_NOT_VERIFIED" }` for unverified users. `@CurrentUser()` param decorator; `@CurrentSellerId()` moves here (from `request.user.seller.id`; 403 if the user has no seller).
- Seed: creates `demo@gbam.app` (verified) as owner of `mama-ngozi` with a random password printed once.

- [ ] **Step 1: Failing tests:** login with uppercase email works; 5 wrong passwords then correct → `TooManyRequestsError`; after `locked_until` passes (set in DB) login works; `forgotPassword` for unknown email resolves and queues nothing; reset with valid code revokes the old session (`me(oldToken)` → 401) and returns a working new one; unverified user calling `GET /orders` → 403 `EMAIL_NOT_VERIFIED`; seller A's token on seller B's order → 404.
- [ ] **Step 2–4:** FAIL → implement → PASS. Remove `DEV_SELLER_ID` from `.env.example` and docs; grep confirms no `x-seller-id` remains.
- [ ] **Step 5:** Commit `feat(auth): login, password reset, sessions; remove dev seller login`.

### Task 13: Web auth: session cookie, proxy, auth pages, dashboard header

**Files:**

- Create: `apps/web/lib/session.ts`, `apps/web/proxy.ts`, `apps/web/app/(auth)/layout.tsx`, `(auth)/signup/page.tsx` (steps 1–2 with `StepRail`), `(auth)/signup/actions.ts`, `(auth)/signup/slug-check.tsx` (client, debounced 400ms), `(auth)/login/page.tsx`, `(auth)/forgot-password/page.tsx`, `(auth)/reset-password/page.tsx`, `(auth)/actions.ts`, `components/brand/{auth-card.tsx,step-rail.tsx}`
- Modify: `apps/web/lib/api.ts` (Bearer from session; on 401 → `redirect("/login?next=…")`), `apps/web/app/dashboard/layout.tsx` (shop name, logout, unverified → `/signup/verify`), `.env.example`
- Test: `apps/web/lib/session.test.ts`, `apps/web/proxy.test.ts`

**Interfaces:**

- Produces: `getSessionToken(): Promise<string | null>`, `setSessionCookie(token: string): Promise<void>` (`gbam_session`, httpOnly, `secure` when `NODE_ENV=production`, `sameSite: "lax"`, `maxAge` 30 days, path `/`), `clearSessionCookie()`.
- Produces: `proxy.ts` matcher `["/dashboard/:path*"]`: no cookie → redirect `/login?next=<path>`. (Cookie validity is checked by the API; `lib/api.ts` handles 401.)

- [ ] **Step 1: Failing tests:** `proxy.test.ts`: request to `/dashboard/orders/1` without cookie → 307 to `/login?next=%2Fdashboard%2Forders%2F1`; with cookie → passes through. `session.test.ts`: `setSessionCookie` sets the exact attributes above (mock `next/headers` cookies). **`lib/api` request receiving 401 calls `redirect("/login?next=/dashboard")` and clears the cookie** (mock `redirect`) (Review Focus 3).
- [ ] **Step 2–4:** FAIL → implement pages per mockups (signup = guided steps option C; login/forgot/reset = centered card option B; server actions keep typed values; `next` param only accepted if it starts with `/` and not `//`) → PASS.
- [ ] **Step 5:** Manual check with `pnpm dev`: sign up → code appears in the terminal (fake email) → verify → dashboard; logout; login; forgot → reset.
- [ ] **Step 6:** Commit `feat(web): signup, login, password reset and protected dashboard`.

---

## Step 6: Onboarding (payouts)

### Task 14: Bank details → account-name check → automatic subaccount

**Files:**

- Modify: `packages/integrations/src/paystack.ts` (+ fakes), `paystack` tests; `apps/api/src/orders/orders.service.ts` (block `awaiting_payment` without subaccount)
- Create: `apps/api/src/payouts/{payouts.module.ts,payouts.controller.ts,payouts.service.ts,payouts.service.test.ts}`; `apps/web/app/(auth)/signup/get-paid/{page.tsx,actions.ts,bank-form.tsx}`; `apps/web/app/dashboard/payout-banner.tsx`

**Interfaces:**

- Produces (integrations): `listBanks(): Promise<{ name: string; code: string }[]>` (GET `/bank?country=nigeria&currency=NGN`), `resolveAccount(input: { accountNumber: string; bankCode: string }): Promise<{ accountName: string }>` (GET `/bank/resolve`), `createSubaccount(input: { businessName: string; bankCode: string; accountNumber: string }): Promise<{ subaccountCode: string }>` (POST `/subaccount`, `percentage_charge: 0`). Fakes: 3 sample banks; account `0000000000` fails to resolve, others resolve to "TEST ACCOUNT"; subaccount code `ACCT_fake_<random>`.
- Produces API (SessionGuard): `GET /payouts/banks` (cached 24h in Redis), `POST /payouts/resolve-account { bankCode, accountNumber /^\d{10}$/ }` → `{ accountName }` (limit 10/10 min), `POST /payouts/account { bankCode, accountNumber }` → resolves again, creates subaccount, then saves `paystackSubaccountCode`, `bankName`, `accountLast4`, `bankAccountName` on the seller.
- Produces: `OrdersService.transition` to `awaiting_payment` by a seller without `paystackSubaccountCode` → `ConflictException({ code: "PAYOUT_ACCOUNT_REQUIRED" })`; `PublicUser.seller.hasPayoutAccount`.

- [ ] **Step 1: Failing tests:** resolve with the fake's bad account → `BadRequestException({ field: "accountNumber" })` **and the seller row is unchanged** (Review Focus 5); successful `POST /payouts/account` stores the code, bank name and last 4 only (full number nowhere in the DB); `createSubaccount` throwing → nothing saved; requesting payment without a subaccount → `PAYOUT_ACCOUNT_REQUIRED`; with one → works (existing payments tests still pass with a subaccount set on the test seller).
- [ ] **Step 2–4:** FAIL → implement; web step 3 shows the resolved name for confirmation, "Skip for now" → `/dashboard`; dashboard shows `PayoutBanner` ("Add your bank account to start receiving payments" → `/signup/get-paid`) while `hasPayoutAccount` is false; the "Request payment" button is disabled with that explanation → PASS.
- [ ] **Step 5:** Commit `feat: onboarding with bank verification and automatic Paystack subaccount`.

---

## Step 7: Storefront, error pages, SEO

### Task 15: Restyled storefront, 404/error, SEO, final link check

**Files:**

- Modify: `apps/web/app/[slug]/page.tsx`, `checkout.tsx`
- Create: `apps/web/app/not-found.tsx`, `apps/web/app/error.tsx`, `apps/web/app/sitemap.ts`, `apps/web/app/robots.ts`, `apps/web/app/opengraph-image.tsx`
- Modify: every page's `metadata` (title, description)
- Test: `apps/web/app/sitemap.test.ts`; `site-nav.test.ts` with `PENDING_ROUTES` now empty

**Interfaces:**

- Consumes: `HEADER_LINKS`, `FOOTER_GROUPS`, `LEGAL_DOCS`, `api.listContent` for help/blog slugs.

- [ ] **Step 1: Failing tests:** `sitemap.test.ts`: contains `https://gbam.app/`, `/pricing`, every `LEGAL_DOCS` URL, and each help article slug from a mocked content list; contains no `/dashboard` URLs. `site-nav.test.ts` passes with `PENDING_ROUTES = []`.
- [ ] **Step 2–4:** FAIL → implement (storefront uses brand tokens, `Logo`, Fraunces store name, existing behaviour unchanged; `not-found` copy "This page went gbam the wrong way" with links home and to help; `robots` disallows `/dashboard`) → PASS.
- [ ] **Step 5:** Full check: `pnpm turbo run build typecheck lint test` all pass; manually view every route at 360px and desktop.
- [ ] **Step 6:** Commit `feat(web): restyled storefront, error pages and SEO`.
