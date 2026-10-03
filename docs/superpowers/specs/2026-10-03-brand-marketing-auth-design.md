# Brand, marketing site, legal pages and seller auth: design

- **Date:** 2026-10-03
- **Status:** approved in conversation; awaiting review of this written spec
- **Covers sub-projects:** 1 (brand & design system), 2 (marketing + legal), 3 (auth + onboarding)
- **Not covered:** 4 (seller dashboard v2), 5 (super admin + CMS editing): separate specs
- **Mockups:** `2026-10-03-brand-marketing-auth-mockups/` (open the `.html` files in a browser)

## 1. Goal and success criteria

Gbam needs a public face that a Nigerian seller trusts with their money, and a real way
to sign up. Today there is only a demo storefront, a dashboard behind a dev-only header,
and no marketing site.

Success means:

- A visitor understands within one screen what Gbam does: sell on WhatsApp, get paid by
  Paystack, customers get updates. The site looks designed, not generated.
- A seller can sign up, verify their email, add a bank account (which creates their
  Paystack subaccount automatically) and land in their dashboard without help.
- The placeholder `x-seller-id` / `DEV_SELLER_ID` login is gone; sellers see only their own shop.
- Public Privacy Policy, Terms and Data Deletion pages exist, so the Meta app can be published.
- Everything works on a phone first.

### Decisions made with the owner

| Topic                   | Decision                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand starting point    | Nothing existing; built from scratch                                                                                                         |
| Personality             | Warm & friendly: soft shapes, approachable, human                                                                                            |
| Colours                 | Forest green + coral on blush (see 2.1)                                                                                                      |
| Typography              | Fraunces (headlines) + DM Sans (everything functional)                                                                                       |
| Logo                    | Wordmark "gbam!" with coral "!"; "g!" tile for icons                                                                                         |
| Imagery                 | Product mockups built in code + people photos (stock first, own shoot later) + simple spot illustrations                                     |
| Home hero               | Centered headline, photo collage on both sides, phone with real order chat, floating "Payment received ₦6,000" card at the phone's top-right |
| Content page template   | Split header (text + photo) and bento grid                                                                                                   |
| Legal page template     | Pill tabs + "On this page" contents + per-section "Short version"                                                                            |
| Auth templates          | Guided 3-step signup; centered card for login / forgot / reset                                                                               |
| Login method            | Email + password with 6-digit email codes. WhatsApp-code login later                                                                         |
| Domain                  | `gbam.app`                                                                                                                                   |
| Operator                | Zephra Studios, registration pending (placeholders in legal pages)                                                                           |
| Contact emails          | `hello@`, `support@`, `privacy@gbam.app`                                                                                                     |
| Marketing site location | Same Next.js app (`apps/web`)                                                                                                                |
| Auth location           | NestJS API owns users and sessions                                                                                                           |
| Editable content        | Stored in the database from day one, seeded from Markdown files                                                                              |

## 2. Brand & design system

### 2.1 Tokens

Defined once in the Tailwind theme (`apps/web/app/globals.css`); no raw hex values in components.

| Token                      | Value                                           | Use                                                            |
| -------------------------- | ----------------------------------------------- | -------------------------------------------------------------- |
| `brand`                    | `#13804F`                                       | Primary buttons, links, success                                |
| `brand-hover`              | `#0F6B42`                                       | Hover/pressed                                                  |
| `brand-tint`               | `#DCEFE5`                                       | Success chips, soft panels                                     |
| `coral`                    | `#FF7A6B`                                       | The "Gbam." word, "!" in the logo, highlights, decorative only |
| `coral-deep`               | `#C9473A`                                       | Coral **text** on light backgrounds (contrast)                 |
| `coral-tint`               | `#FFD2C9` / `#FFF0EC`                           | "New" chips, plain-English boxes                               |
| `blush`                    | `#FFF8F5`                                       | Page background                                                |
| `ink`                      | `#132A20`                                       | Body text                                                      |
| `ink-muted` / `ink-subtle` | `#3B4B43` / `#6B7A72`                           | Secondary text                                                 |
| Radius                     | 16–22px cards, full pills for buttons and chips |                                                                |
| Shadow                     | Soft, green-tinted (`rgba(19,42,32,.12–.28)`)   |                                                                |

Fonts: **Fraunces** (variable; 700–900 for headlines, big numbers, "Gbam.") and **DM Sans**
(400/500/700 for UI, forms, prices, tables), loaded with `next/font` so they are self-hosted.

### 2.2 Logo

- Wordmark: lowercase "gbam" in Fraunces 900, coral "!". Delivered as SVG (`components/brand/logo.tsx`).
- Icon: "g!" in white on a forest-green rounded tile → favicon, app icon, social avatar.
- Social share image (`opengraph-image`) generated with the wordmark and tagline.

### 2.3 Shared components (`apps/web/components/brand/`)

Header (with mobile menu), Footer (Product · Company · Help · Legal), Button (primary, secondary,
ghost), TextField / PasswordField / CodeInput, `Photo` slot, `PhoneMockup`, `PaymentToast`,
`BentoGrid` + `BentoTile`, `CtaBand` ("Ready? **Gbam.**"), `PillTabs`, `ShortVersion` note,
`AuthCard`, `StepRail`, `Prose` (rendered Markdown).

### 2.4 Imagery

1. **Product mockups:** built in code from real screens (WhatsApp order chat, storefront,
   dashboard) inside `PhoneMockup`. Free, accurate, never generic.
2. **People photos:** `<Photo description="food vendor at her stall" />`. The owner approves a
   shortlist of specific Unsplash/Pexels photos (links + licence check) before they are
   downloaded into `apps/web/public/photos/`. Until then the slot renders a branded placeholder
   (blush pattern + description), never a broken image.
3. **Icons:** Lucide (rounded, consistent), plus a handful of simple coral/green SVG spot illustrations.

### 2.5 Accessibility (requirements, not nice-to-haves)

- WCAG AA contrast; coral is never used for small text on blush (use `coral-deep`).
- Visible focus rings; every control reachable by keyboard; form errors announced (`role="alert"`).
- Layouts work from 360px wide with no horizontal scroll; tap targets ≥ 44px.

## 3. Pages

### 3.1 Marketing (content template: split header + bento, unless noted)

| Route                   | Content                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                     | Approved hero (see mockup) → 3-step "How it works" → features bento → "Made for every kind of seller" photo collage → pricing teaser → FAQ highlights → CTA band                                                                                 |
| `/features`             | Storefront link · Paystack payments · automatic WhatsApp updates · order dashboard · payouts to bank · delivery status                                                                                                                           |
| `/how-it-works`         | Seller journey and customer journey, step by step with mockups                                                                                                                                                                                   |
| `/pricing`              | 1.5% per paid order capped at ₦1,000 (from `PLATFORM_FEE` in `@gbam/shared`, never hard-coded); Paystack fee paid from seller share; founding-seller offer; "what you'd receive" calculator using `calculatePlatformFee` + `estimatePaystackFee` |
| `/use-cases`            | Food & drinks, fashion, beauty, phones & gadgets, cakes & catering, thrift: photo + short story each                                                                                                                                             |
| `/about`                | Why Gbam exists; Zephra Studios; the team                                                                                                                                                                                                        |
| `/mission`              | The problem (chasing payments in DMs), what Gbam changes, where it's going                                                                                                                                                                       |
| `/security`             | How money and data are protected: Paystack, signed webhooks, no card data stored, hashed passwords                                                                                                                                               |
| `/contact`              | Form (name, email, optional phone, message) → stored + emailed to `hello@`; WhatsApp link; email addresses                                                                                                                                       |
| `/help`, `/help/[slug]` | Help centre: categories (Getting started, Orders, Payments, Account), search over titles/summaries, articles                                                                                                                                     |
| `/faq`                  | Grouped questions, open/close answers                                                                                                                                                                                                            |
| `/blog`, `/blog/[slug]` | 2–3 genuinely useful starter posts                                                                                                                                                                                                               |
| `/changelog`            | Dated entries of what's new                                                                                                                                                                                                                      |

### 3.2 Legal (legal template)

`/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/refunds`, `/legal/seller-agreement`,
`/legal/acceptable-use`, `/legal/data-deletion`.

- Written for a Nigerian payments business: Nigeria Data Protection Act 2023, Paystack as
  payment processor, Meta/WhatsApp as messaging processor, data retention, user rights,
  contact `privacy@gbam.app`.
- Operator shown as "Zephra Studios (registration pending)" with visible placeholders
  `[RC number]`, `[Registered address]` for the owner to fill in.
- Each page states "Last updated" and carries a note that it is a draft pending legal review.
- Cookie Policy states only an essential session cookie is used, so **no cookie banner**.
  Adding analytics later requires adding consent.
- `/legal/data-deletion` doubles as the Data Deletion Instructions URL Meta requires.

### 3.3 Other pages

- Customer storefront `/[slug]`: restyled in the new brand; behaviour unchanged.
- `not-found` and `error` pages in the brand voice.
- SEO: per-page title/description, Open Graph image, `sitemap.ts`, `robots.ts`.

### 3.4 Honesty rule

No fabricated testimonials, review stars, user counts or seller logos anywhere. Where social
proof would go, show product facts ("Payments by Paystack", "No app to install", "Free for
founding sellers") until real sellers can be quoted with permission.

## 4. Auth & onboarding

### 4.1 Sign up (guided, 3 steps; `StepRail` + progress bar)

1. **Your shop:** business name; shop link with live availability check
   (`gbam.app/<slug>`; uses `slugSchema` + `RESERVED_SLUGS`); WhatsApp number
   (`nigerianPhoneSchema`); email; password (≥ 8 characters, strength hint).
   Creates `users` + `sellers` rows in one transaction, signs the user in, and emails a
   6-digit verification code.
2. **Verify:** 6-digit code. Expires in 15 minutes; 5 attempts; "Resend" available after 60
   seconds; a new code invalidates the previous one.
3. **Get paid:** choose bank (Paystack bank list) + account number → Paystack resolves the
   account name, shown for confirmation → on confirm, create a Paystack subaccount
   (`percentage_charge: 0`; our cut is sent per transaction) and store its code.
   **"Skip for now"** goes to the dashboard with a persistent banner; **"Request payment" is
   disabled until a subaccount exists.**

Unverified users can reach only the verify step; everything else redirects there.

### 4.2 Log in, forgot, reset (centered card)

- **Log in:** email + password. After 5 failed attempts the account is locked for 15 minutes
  (`failed_login_count`, `locked_until`); success resets the counter.
- **Forgot password:** always responds "If that email has an account, we've sent a code"
  (no account enumeration).
- **Reset password:** code + new password → password updated, **all sessions revoked**, user
  signed in on this device with a fresh session.

### 4.3 Sessions

- Token: 32 random bytes; only its SHA-256 hash is stored in `sessions`.
- Cookie `gbam_session`: HttpOnly, Secure (in production), SameSite=Lax, 30-day expiry,
  extended on use (sliding, at most once a day).
- Next.js server reads the cookie and calls the API with `Authorization: Bearer <token>`.
  The browser still never calls the API directly.
- `/dashboard/**` is protected: no valid session → redirect to `/login?next=…`.
- `SessionGuard` (API) resolves token → user → seller and replaces `SellerGuard`.
  `CurrentSellerId` keeps working for controllers. `DEV_SELLER_ID` and the `x-seller-id`
  header are removed.

### 4.4 Passwords and codes

- Passwords hashed with Argon2id (`@node-rs/argon2`).
- Email codes: 6 digits from `crypto.randomInt`, stored as SHA-256 hash with purpose,
  expiry and attempt count.

## 5. Data model changes (one migration)

```
users            id, email (unique, lowercase), password_hash, email_verified_at,
                 role enum('seller','admin') default 'seller',
                 failed_login_count int default 0, locked_until, created_at, updated_at
sessions         id, user_id → users (cascade), token_hash (unique), expires_at,
                 last_used_at, user_agent, ip, created_at
email_codes      id, user_id → users (cascade), purpose enum('verify_email','reset_password'),
                 code_hash, expires_at, attempts int default 0, consumed_at, created_at
contact_messages id, name, email, phone, message, status enum('new','handled'), created_at
content_entries  id, type enum('help_article','faq','blog_post','changelog','legal'),
                 slug, title, summary, body (markdown), data jsonb, category,
                 sort_order int, published_at, created_at, updated_at;
                 unique (type, slug)
sellers (+)      owner_user_id → users (unique), bank_name, account_last4,
                 bank_account_name
```

The demo seller `mama-ngozi` gets a demo owner user in the seed script
(`demo@gbam.app`, password printed by `pnpm db:seed`).

Content source: `packages/db/content/<type>/<slug>.md` with frontmatter. `pnpm db:seed`
upserts them by `(type, slug)`. Legal pages store their sections (heading, body,
short version) in `data`.

## 6. Architecture

### 6.1 API (`apps/api/src/`)

| Module              | Responsibility                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`             | `POST /auth/signup`, `/auth/verify-email`, `/auth/resend-code`, `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`; `GET /auth/me`, `GET /auth/slug-available`; `SessionGuard` |
| `payouts/`          | `GET /payouts/banks`, `POST /payouts/resolve-account`, `POST /payouts/account` (creates the subaccount)                                                                                                    |
| `email/`            | `emails` queue + processor (worker only), templates for verify and reset codes                                                                                                                             |
| `content/`          | `GET /content/:type`, `GET /content/:type/:slug` (published only)                                                                                                                                          |
| `contact/`          | `POST /contact`                                                                                                                                                                                            |
| `common/rate-limit` | Redis-backed fixed-window limiter used by auth, codes, contact and slug checks                                                                                                                             |

### 6.2 Integrations (`packages/integrations`)

- Paystack client gains `listBanks`, `resolveAccount`, `createSubaccount` (and fakes).
- New `EmailClient` interface: `ResendEmailClient` + `FakeEmailClient` (prints to the terminal).

### 6.3 Web (`apps/web/app/`)

```
(marketing)/   page.tsx (home), features, how-it-works, pricing, use-cases, about, mission,
               security, contact, help, help/[slug], faq, blog, blog/[slug], changelog
legal/[doc]/   one template for all legal pages
(auth)/        signup (steps 1–3), login, forgot-password, reset-password
dashboard/     existing pages + new header (shop name, logout) + "add bank" banner
[slug]/        customer storefront (restyled)
components/brand/  shared components (2.3)
```

Markdown is rendered with `react-markdown` without raw HTML.

### 6.4 Settings

| Variable         | Dev                                | Production                           |
| ---------------- | ---------------------------------- | ------------------------------------ |
| `RESEND_API_KEY` | optional → fake email              | required                             |
| `EMAIL_FROM`     | default `Gbam <no-reply@gbam.app>` | required (domain verified in Resend) |
| `WEB_URL`        | `http://localhost:3000`            | `https://gbam.app`                   |
| `DEV_SELLER_ID`  | **removed**                        |                                      |

## 7. Error handling

- Field-level, plain-language errors; forms keep typed values after a failed submit.
- Email sending is queued with retries; the UI offers "Resend code".
- Paystack failures during bank setup show a retryable message; nothing half-created
  (subaccount code saved only after Paystack confirms).
- Rate-limited requests: HTTP 429, "Too many attempts, try again in N minutes".
- Branded `not-found` and `error` pages; errors logged server-side.

## 8. Testing

- **Unit:** password and code rules, slug availability, session token helpers, Markdown
  rendering strips HTML, fee calculator on the pricing page.
- **Integration (real DB, Redis db 1):** signup → verify → bank → subaccount (stubbed
  Paystack); login lockout after 5 failures; reset revokes other sessions; expired and
  reused codes rejected; a seller cannot read another seller's orders; contact form
  rate limit; unverified user blocked from the dashboard API.
- **Pages:** every route builds and renders; a link checker confirms every header/footer
  link resolves; a check that pages work at a 360px-wide viewport.

## 9. Out of scope

Dashboard v2 (analytics, products, customers, payouts screens), super admin and CMS editing
UI, WhatsApp-code login, team members, analytics/cookie banner, real photography (shortlist
only), refunds through Paystack.

## 10. Build order

Each step is committed and reviewed before the next:

1. Brand system: tokens, fonts, logo, shared components
2. Home page (approved hero + sections)
3. Other marketing pages + help, FAQ, blog, changelog (with `content_entries`)
4. Legal pages (unblocks publishing the Meta app)
5. Auth: signup, verify, login, forgot/reset, sessions; remove the dev login
6. Onboarding: bank → account-name check → automatic subaccount
7. Restyled storefront, 404/error pages, SEO
