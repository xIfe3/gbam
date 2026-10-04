# Product Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sellers manage products (1–4 photos, up to 3 options, variants with their own price and stock) from the dashboard; customers open a product's own page, pick a variant, build a basket and pay.

**Architecture:** New tables `product_options`, `product_variants`, `product_images`; every product has ≥ 1 variant and order items point at variants. Photos go web server action → API → `sharp` (two WebP sizes) → a `PhotoStorage` (R2 in production, local folder in dev/tests). Stock is reduced inside the transaction that moves an order to `paid`. The storefront gets per-product pages and a browser-stored basket.

**Tech Stack:** NestJS 12 (ESM, `.js` imports), Drizzle + Postgres, BullMQ, Zod 4 in `@gbam/shared`, `sharp`, `@aws-sdk/client-s3` (R2 is S3-compatible), Next.js 16 App Router + Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-product-management-design.md`

## Global Constraints

- Follow `CLAUDE.md` plain-code rules: async/await + try/catch, if/else over ternaries (trivial JSX ones allowed), `for` loops over `reduce`/long chains, no `!` assertions, no `??=`, a short "why" comment where a concept may be new (transactions, row locks, optimistic versions, multipart, localStorage).
- Run `pnpm turbo run build typecheck lint test` before every commit; commit only when every task passes and nothing is skipped.
- API tests: real dev Postgres (port 5433) and Redis **db 1**; sellers via `createTestSeller`, products via `createTestProduct` (Task 1). Never kill the owner's `pnpm dev`.
- The browser never calls the API; `apps/web/lib/api.ts` (server-only) is the only API client.
- Brand tokens only (`brand`, `brand-hover`, `brand-tint`, `coral`, `coral-deep`, `coral-tint`, `coral-wash`, `blush`, `ink`, `ink-muted`, `ink-subtle`); coral is never small text on blush. Alerts use `FormError`/`FormNotice` from `components/brand/form-bits.tsx` (thin full border, `rounded-lg`, no left stripe).
- Every page works at 360 px with no horizontal scroll; tap targets ≥ 44 px; visible focus rings.
- Limits (spec): photos 1–4 per product, ≤ 10 MB each, JPEG/PNG/WebP/HEIC; large 1600 px / small 400 px WebP; ≤ 3 options, option names unique, 1–20 values, values unique per option; 1–50 variants; price ≥ 10000 kobo (₦100); stock `null` or integer ≥ 0; 60 uploads/hour/seller; orphan photos deleted after 24 h.
- Product `slug` is set once at creation and never changes; `order` is reserved.
- Copy (exact): stale save → "This product changed since you opened it. Reload to see the latest."; shortfall warning → "Stock ran out: refund needed".
- Do not stage `.env` or anything under `.superpowers/`.

## Review Focus

1. **iPhone HEIC photos.** `sharp`'s prebuilt binaries can't decode HEIC (HEVC). Expect: the file input's `accept="image/jpeg,image/png,image/webp"` makes iOS convert to JPEG before upload; if a HEIC still arrives and can't be decoded, the API answers 400 "We can't read this photo. Try a JPEG or PNG." (never 500). Test in Task 4.
2. **Seller renames or removes an option value after variants exist** ("M" → "Medium"). Expect: the editor rebuilds the combinations and keeps price/stock/photo for every combination whose other values are unchanged. Test in Task 12.
3. **Prices typed the Nigerian way** ("12,000", "₦12,000", " 12000 "). Expect: all become 1200000 kobo; "12.5k" or empty is a field error. Test in Task 2 (`parseNairaInput`).
4. **Two customers pay for the last unit.** Expect: the first paid order takes the stock to 0, the second is still marked paid with `stock_shortfall = true`, and stock never goes negative. Test in Task 7.
5. **Every variant switched off or sold out.** Expect: saving with zero enabled variants is a validation error ("Switch on at least one option"); a product whose enabled tracked variants are all at 0 shows "Sold out" and can't be added to the basket. Tests in Tasks 2 and 6.

---

## File Structure

**Database (`packages/db`)**
- `src/schema.ts`: new tables and columns (Task 1); old product columns removed (Task 8).
- `migrations/0006_*.sql`: additive schema + backfill (Task 1). `migrations/0007_*.sql`: drop old columns (Task 8).
- `src/seed.ts`: demo products with variants (Tasks 1, 8).

**Shared (`packages/shared/src`)**
- `products.ts` (new): product schemas, rules, `variantTitle`, `productSlugBase`, `parseNairaInput`, `combinations`. Exported from `index.ts`.

**Integrations (`packages/integrations/src`)**
- `photo-storage.ts` (new): `PhotoStorage` interface, `LocalPhotoStorage`, `R2PhotoStorage`.

**API (`apps/api/src`)**
- `products/` becomes a folder of focused files (replacing the single `products.module.ts`): `products.module.ts`, `photos.service.ts`, `photo-processing.ts`, `photos.controller.ts`, `products.service.ts`, `product-rules.ts`, `products.controller.ts`, `storefront.service.ts`, `storefront.controller.ts`, `photo-cleanup.queue.ts`, `photo-cleanup.processor.ts`, plus tests.
- `orders/orders.service.ts`, `orders/stock.ts` (new): variants on orders, stock reduction.
- `integrations/integrations.module.ts`, `env.ts`, `main.ts`, `worker.module.ts`, `test-helpers.ts`.

**Web (`apps/web`)**
- `lib/api.ts`: new types and calls. `lib/basket.ts` (new): browser basket.
- `app/[slug]/page.tsx` (grid), `app/[slug]/[product]/page.tsx` + `variant-picker.tsx`, `app/[slug]/order/page.tsx` + `basket-view.tsx`, `app/[slug]/basket-bar.tsx`, `app/[slug]/actions.ts`; `checkout.tsx` removed.
- `app/dashboard/layout.tsx` (nav), `app/dashboard/products/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `actions.ts`, `editor/` (`photo-picker.tsx`, `options-editor.tsx`, `variant-cards.tsx`, `new-product-steps.tsx`, `edit-product-form.tsx`, `editor-state.ts`).
- `app/dashboard/orders/[id]/page.tsx`: variant titles + shortfall warning.
- `next.config.ts`: server action body limit.

---

### Task 1: Additive schema, backfill migration, test helper

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/migrations/0006_<generated>.sql` (generated, then hand-edited to add the backfill)
- Modify: `packages/db/src/seed.ts`, `apps/api/src/test-helpers.ts`
- Test: `apps/api/src/products/migration.test.ts`

**Interfaces:**
- Produces (schema exports from `@gbam/db`):
  - `productStatusEnum` = `pgEnum("product_status", ["active","hidden","archived"])`
  - `products` gains `slug: text NOT NULL`, `status: product_status NOT NULL default 'active'`, `version: integer NOT NULL default 1`; unique index `products_seller_slug_idx` on (`seller_id`,`slug`). Old `price_kobo`, `stock`, `is_active` **stay** until Task 8.
  - `productOptions` (`id`, `productId` cascade, `name`, `values: text[]`, `position`)
  - `productImages` (`id`, `sellerId` cascade, `productId` nullable cascade, `position`, `largeKey`, `smallKey`, `width`, `height`, `createdAt`)
  - `productVariants` (`id`, `productId` cascade, `position`, `optionValues: text[] NOT NULL default '{}'`, `title: text NOT NULL default ''`, `priceKobo`, `stock` nullable, `imageId` nullable → `productImages` set null, `isEnabled` default true, `archivedAt` nullable); unique index on (`product_id`, `option_values`).
  - `orderItems` gains `variantId` (→ `productVariants`, set null) and `variantTitle: text NOT NULL default ''`.
  - `orders` gains `stockShortfall: boolean NOT NULL default false`.
  - Drizzle relations for the new tables.
- Produces (`apps/api/src/test-helpers.ts`):
  `createTestProduct(db: Db, sellerId: string, input?: { name?: string; priceKobo?: number; stock?: number | null; status?: "active"|"hidden"|"archived" }): Promise<{ product: Product; variant: ProductVariant }>`: inserts a product (random slug) and its one default variant. Until Task 8 it also fills the old `price_kobo`/`stock`/`is_active` columns so existing code keeps working.

- [ ] **Step 1: Write the failing test** `apps/api/src/products/migration.test.ts`
  - `it("gives every product exactly one default variant with its price and stock")`: select products left-joined to variants with `option_values = '{}'`; expect zero products without one, and for the demo seller's products expect variant `priceKobo`/`stock` equal to the product's old columns.
  - `it("backfills order_items.variant_id from product_id")`: expect zero rows where `product_id IS NOT NULL AND variant_id IS NULL`.
  - `it("gives every product a slug unique within its shop")`: expect no duplicate (`seller_id`, `slug`) pairs and every slug matching `/^[a-z0-9]+(-[a-z0-9]+)*$/`.
  - `it("createTestProduct makes a product with one default variant")`.
- [ ] **Step 2: Run** `pnpm --filter @gbam/api exec vitest run src/products/migration.test.ts`. Expected: FAIL (tables/columns don't exist).
- [ ] **Step 3: Edit the schema, run `pnpm db:generate`, then append the backfill to the generated SQL** in this order: add `slug` as nullable → fill it → make it NOT NULL → add the unique index; `status` from `is_active`; one default variant per product; `order_items.variant_id`. Slug backfill in SQL (dedupe within a seller with a `-2`, `-3` suffix via `row_number()`):

```sql
UPDATE products p SET slug = s.base || CASE WHEN s.n = 1 THEN '' ELSE '-' || s.n END
FROM (
  SELECT id,
         coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'product') AS base,
         row_number() OVER (PARTITION BY seller_id,
           coalesce(nullif(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), ''), 'product')
           ORDER BY created_at) AS n
  FROM products
) s WHERE p.id = s.id;
```
  Update `seed.ts` so demo products also get a slug and a default variant. Implement `createTestProduct`.
- [ ] **Step 4: Run** `pnpm db:migrate` then the test again. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `pnpm turbo run build typecheck lint test`; `git commit -m "feat(db): product variants, options and images tables with backfill"`.

---

### Task 2: Shared product schema and rules

**Files:**
- Create: `packages/shared/src/products.ts`, `packages/shared/src/products.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/schemas.ts` (add `"order"` handling, see below)

**Interfaces:**
- Produces:
  - `PRODUCT_LIMITS = { maxImages: 4, maxOptions: 3, maxValuesPerOption: 20, maxVariants: 50, minPriceKobo: 10000, maxPhotoBytes: 10 * 1024 * 1024 }`
  - `productSlugBase(name: string): string`: lowercase, non `[a-z0-9]` runs → `-`, trimmed of `-`, max 60 chars, `"product"` if empty, and `"order"` becomes `"order-1"` (same algorithm as the Task 1 SQL).
  - `variantTitle(optionValues: string[]): string`: `["M","Red"]` → `"M / Red"`, `[]` → `""`.
  - `combinations(options: { name: string; values: string[] }[]): string[][]`: cartesian product in option order (`[]` → `[[]]`).
  - `parseNairaInput(text: string): number | null`: strips spaces, commas and a leading `₦`; whole naira only; returns kobo or `null`.
  - `productInputSchema` (Zod): `{ name: string(1..120, trimmed), description?: string(≤2000), imageIds: uuid[] (1..4, unique), options: { name: string(1..30), values: string(1..30)[] (1..20, unique) }[] (0..3, names unique case-insensitively), variants: { id?: uuid, optionValues: string[], priceKobo: int ≥ 10000, stock: int ≥ 0 | null, imageId: uuid | null, isEnabled: boolean }[] (1..50) }`, with a `superRefine` enforcing: each variant has one value per option, every value exists in that option, no duplicate combinations, no options ⇒ exactly one variant with `optionValues: []`, every `imageId` is in `imageIds`, at least one `isEnabled` (message "Switch on at least one option"). Issues use paths like `["variants", 2, "priceKobo"]` so the web can show them per card.
  - `updateProductInputSchema` = `productInputSchema` plus `version: int ≥ 1`.
  - `productStatusSchema = z.enum(["active","hidden","archived"])`.
  - `createOrderSchema` items change to `{ variantId: uuid, quantity: int 1..99 }` **in Task 7** (not here).
  - Types: `ProductInput`, `UpdateProductInput`, `ProductStatus`.

- [ ] **Step 1: Write failing tests** in `products.test.ts`:
  - `productSlugBase("Ankara Wrap Dress!")` → `"ankara-wrap-dress"`; `"  "` → `"product"`; `"Order"` → `"order-1"`; a 100-char name is cut to ≤ 60 with no trailing `-`.
  - `variantTitle(["M","Red"])` → `"M / Red"`.
  - `combinations([{name:"Size",values:["S","M"]},{name:"Colour",values:["Red"]}])` → `[["S","Red"],["M","Red"]]`.
  - `parseNairaInput`: `"12,000"`, `"₦12,000"`, `" 12000 "` → `1200000`; `"12.5k"`, `""`, `"-5"` → `null`. *(Review Focus 3)*
  - `productInputSchema` accepts a no-option product with one default variant; rejects: 0 images, 5 images, duplicate combination, variant missing a value, value not in its option, option names "Size"/"size", price 9999, stock -1, `imageId` not in `imageIds`, all variants disabled (message "Switch on at least one option") *(Review Focus 5)*; error path for a bad price is `["variants", 1, "priceKobo"]`.
- [ ] **Step 2: Run** `pnpm --filter @gbam/shared exec vitest run src/products.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `packages/shared/src/products.ts`; export from `index.ts`.
- [ ] **Step 4: Run the test**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(shared): product input schema, variant helpers, naira parsing`.

---

### Task 3: Photo storage and configuration

**Files:**
- Create: `packages/integrations/src/photo-storage.ts`, `packages/integrations/src/photo-storage.test.ts`
- Modify: `packages/integrations/src/index.ts`, `packages/integrations/package.json` (add `@aws-sdk/client-s3`)
- Modify: `apps/api/src/env.ts`, `apps/api/src/env.test.ts`, `apps/api/src/integrations/integrations.module.ts`, `apps/api/src/main.ts`
- Modify: `.env.example`, `.env.production.example`, `docker/docker-compose.prod.yml`, `docs/integrations-setup.md`, `.gitignore` (`/apps/api/uploads/`)

**Interfaces:**
- Produces (`@gbam/integrations`):
  - `interface PhotoStorage { put(key: string, body: Buffer, contentType: string): Promise<void>; delete(key: string): Promise<void>; publicUrl(key: string): string }`
  - `class LocalPhotoStorage implements PhotoStorage`: `constructor(folder: string, publicBaseUrl: string)`; `put` writes `folder/key` (creating folders); `delete` ignores a missing file; `publicUrl` = `${publicBaseUrl}/${key}`. Rejects keys containing `..` or starting with `/`.
  - `class R2PhotoStorage implements PhotoStorage`: `constructor(config: { accountId; accessKeyId; secretAccessKey; bucket; publicBaseUrl })`; uses `S3Client` with endpoint `https://${accountId}.r2.cloudflarestorage.com`, region `"auto"`, `PutObjectCommand` (with `CacheControl: "public, max-age=31536000, immutable"`) and `DeleteObjectCommand`.
- Produces (API):
  - Env keys `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `PHOTOS_PUBLIC_URL` (all `optional`), added to `PRODUCTION_REQUIRED_KEYS`. `PHOTOS_LOCAL_DIR` (default `"uploads/photos"` relative to `apps/api`).
  - `PHOTO_STORAGE` symbol + `InjectPhotoStorage()` in `integrations.module.ts`; factory returns `R2PhotoStorage` when all R2 keys are set, else `LocalPhotoStorage(PHOTOS_LOCAL_DIR, PHOTOS_PUBLIC_URL ?? "http://localhost:${PORT}/photos")` with a warning log, like the email fake.
  - `main.ts`: when `NODE_ENV !== "production"`, serve `PHOTOS_LOCAL_DIR` at `/photos` (Express static via `app.useStaticAssets` on `NestExpressApplication`).

- [ ] **Step 1: Write failing tests**
  - `photo-storage.test.ts`: `LocalPhotoStorage` put → file exists with the bytes; `publicUrl("ab/cd.webp")` → `"http://x/photos/ab/cd.webp"`; delete removes it; deleting a missing key doesn't throw; key `"../evil"` throws. (Use a temp folder from `fs.mkdtemp`.)
  - `env.test.ts`: production without `R2_BUCKET` lists it as "Required in production"; the existing test that checks `.env.production.example` and the compose file list every `PRODUCTION_REQUIRED_KEYS` entry now covers the five new keys.
- [ ] **Step 2: Run** both test files. Expected: FAIL.
- [ ] **Step 3: Implement** storage classes, env keys, provider, static serving; document R2 setup in `docs/integrations-setup.md` (create bucket, public custom domain `photos.gbam.app`, API token with Object Read & Write on that bucket, the five env values).
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(api): photo storage (R2 in production, local folder in dev)`.

---

### Task 4: Photo upload, processing and cleanup

**Files:**
- Create: `apps/api/src/products/photo-processing.ts`, `photos.service.ts`, `photos.controller.ts`, `photo-cleanup.queue.ts`, `photo-cleanup.processor.ts`, `photos.test.ts`, `photo-processing.test.ts`, `test-fixtures/` (tiny JPEG with EXIF GPS + rotation, PNG, a `.txt` renamed `.jpg`, a HEIC sample)
- Move: `apps/api/src/products/products.module.ts` keeps the module; existing service/controllers move out in Task 5 (this task only adds providers to it).
- Modify: `apps/api/package.json` (add `sharp`), `apps/api/src/worker.module.ts`

**Interfaces:**
- Produces:
  - `processPhoto(input: Buffer): Promise<{ large: Buffer; small: Buffer; width: number; height: number }>` in `photo-processing.ts`: reads format via `sharp(input).metadata()`; allowed formats `jpeg`, `png`, `webp`, `heif`; otherwise throws `UnsupportedPhotoError`. Pipeline `sharp(input).rotate()` (applies EXIF orientation), resize `fit: "inside", withoutEnlargement: true` to 1600 and 400, `.webp({ quality: 80 })`. sharp drops metadata by default (don't call `withMetadata`). Any decode failure → `UnsupportedPhotoError`.
  - `class UnsupportedPhotoError extends Error`.
  - `PhotosService`:
    - `upload(sellerId: string, file: { buffer: Buffer; size: number }): Promise<{ id: string; smallUrl: string }>`: size > 10 MB → 413 `{ message: "Photos can be up to 10 MB" }`; rate limit key `photo-upload:${sellerId}` 60/hour via `RateLimiter` → 429 with `retryAfterSeconds`; `UnsupportedPhotoError` → 400 `{ message: "We can't read this photo. Try a JPEG or PNG." }`; keys `${sellerId}/${randomUUID()}-l.webp` and `-s.webp`; inserts `product_images` with `productId: null`.
    - `deleteUnattached(sellerId: string, imageId: string): Promise<void>`: 404 unless the image is this seller's and unattached; deletes files then row.
    - `deleteFiles(keys: string[]): Promise<void>`: deletes stored files one by one; a failure is logged, not thrown (an orphaned file is harmless). Task 5 calls it after its transaction commits, with the keys of photos removed from a product.
    - `cleanupOrphans(olderThan: Date): Promise<number>`: deletes unattached images created before `olderThan` and their files; returns the count.
    - `urlsFor(image: { largeKey: string; smallKey: string }): { large: string; small: string }`.
  - `PhotosController` (`@Controller("products/images")`, `@UseGuards(SessionGuard)`): `POST /` with `FileInterceptor("photo", { limits: { fileSize: 10 * 1024 * 1024 + 1 } })` (multer from `@nestjs/platform-express`); `DELETE /:id`.
  - `PhotoCleanupQueue` registers a BullMQ repeatable job (`every: 24h`, `jobId: "photo-cleanup"`) on startup; `PhotoCleanupProcessor` (worker) calls `cleanupOrphans(new Date(Date.now() - 24h))` and logs the count.

- [ ] **Step 1: Write failing tests**
  - `photo-processing.test.ts`: JPEG fixture with EXIF GPS and orientation 6 → outputs are WebP, `large` longest side ≤ 1600, `small` ≤ 400, output metadata has no `exif` *(GPS stripped)*, and width/height reflect the rotation; PNG works; text file → `UnsupportedPhotoError`; HEIC fixture → `UnsupportedPhotoError` or a valid WebP (either is acceptable, never an unhandled error) *(Review Focus 1)*.
  - `photos.test.ts` (HTTP, like `payouts.controller.test.ts`, with a `LocalPhotoStorage` in a temp folder overriding `PHOTO_STORAGE`): upload returns `{ id, smallUrl }` and both files exist; 11 MB file → 413 "Photos can be up to 10 MB"; text file → 400 "We can't read this photo. Try a JPEG or PNG."; unverified seller → 403; 61st upload in an hour → 429; seller B deleting seller A's unattached image → 404; `cleanupOrphans` removes an unattached image older than 24 h and keeps a newer one and an attached one.
- [ ] **Step 2: Run** `pnpm --filter @gbam/api exec vitest run src/products/photo`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above; register `PhotosController`, `PhotosService`, `PhotoCleanupQueue` in `ProductsModule`; add `PhotoCleanupProcessor` to `WorkerModule`.
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(api): photo upload with resizing, metadata stripping, limits and cleanup`.

---

### Task 5: Seller product endpoints

**Files:**
- Create: `apps/api/src/products/products.service.ts`, `product-rules.ts`, `products.controller.ts`, `products.test.ts`
- Modify: `apps/api/src/products/products.module.ts` (now only the `@Module`, importing the split files; the old inline `ProductsService`/`ProductsController` are removed)

**Interfaces:**
- Consumes: `productInputSchema`, `updateProductInputSchema`, `productStatusSchema`, `productSlugBase`, `variantTitle` (Task 2); `PhotosService` (Task 4).
- Produces:
  - `ProductsService`:
    - `list(sellerId): Promise<ProductListItem[]>` where `ProductListItem = { id; slug; name; status; mainPhotoUrl: string | null; minPriceKobo; maxPriceKobo; variantCount; totalStock: number | null }` (`totalStock` null when no enabled variant is tracked). Excludes `archived`. Ordered by `createdAt` desc.
    - `get(sellerId, productId): Promise<ProductDetail>`: `{ id; slug; name; description; status; version; images: { id; position; largeUrl; smallUrl }[]; options: { name; values }[]; variants: { id; optionValues; title; priceKobo; stock; imageId; isEnabled }[] }` (archived variants left out). 404 for another seller's id.
    - `create(sellerId, input: ProductInput): Promise<ProductDetail>`
    - `update(sellerId, productId, input: UpdateProductInput): Promise<ProductDetail>`
    - `setStatus(sellerId, productId, status: ProductStatus): Promise<void>`
    - `remove(sellerId, productId): Promise<{ archived: boolean }>`
  - `product-rules.ts`: `assertImagesUsable(tx, sellerId, imageIds, productId | null)` (every image is this seller's and is unattached or already on `productId`, else 400 field `imageIds`); `uniqueSlug(tx, sellerId, name): Promise<string>` (base from `productSlugBase`, then `-2`, `-3`… until free).
  - Controller `@Controller("products")` + `SessionGuard`: `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id/status`, `DELETE /:id`, bodies through `ZodPipe`.

- [ ] **Step 1: Write failing tests** `products.test.ts` (HTTP, local photo storage in a temp folder; helper uploads fixture photos first):
  - create a no-option product → 201; storefront-facing fields: slug from name, one variant with `title ""`.
  - create "Ankara wrap dress" with Size S/M × Colour Red → 2 variants titled `"S / Red"`, `"M / Red"`; a second product with the same name gets slug `ankara-wrap-dress-2`.
  - images are attached in the given order; position 1 is `mainPhotoUrl` in `list`.
  - `PUT` with a stale `version` → 409 with message "This product changed since you opened it. Reload to see the latest."; with the right version → `version` + 1.
  - `PUT` that drops a variant never ordered → variant row deleted; drops one that is on an order → `archivedAt` set and it's gone from `get`.
  - `PUT` that removes a photo → row and both files deleted after the save.
  - renaming the product keeps the slug.
  - `DELETE` a never-ordered product → row gone, photos deleted; an ordered one → `status = archived`, `{ archived: true }`, absent from `list`.
  - seller B: `GET`, `PUT`, `PATCH`, `DELETE` on seller A's product → 404; seller B creating with seller A's image id → 400.
  - one failing write inside `update` leaves the product unchanged (force a duplicate combination that slips past Zod by calling the service directly with a crafted input, then assert nothing changed: transaction rollback).
- [ ] **Step 2: Run** `pnpm --filter @gbam/api exec vitest run src/products/products.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `create` and `update` run in one `db.transaction`. `update` locks the product row (`.for("update")`), compares `version`, then: options are replaced; variants matched by `id` (insert new, update existing, delete missing ones unless referenced by `order_items`, in which case set `archivedAt` and `isEnabled = false`); images: attach listed ones with positions, collect keys of removed ones, delete their rows; `version = version + 1`. After commit, delete the removed files with `PhotosService.deleteFiles` (a failure there is logged, not thrown: orphaned files are harmless).
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(api): create, edit, hide and delete products with variants`.

---

### Task 6: Storefront endpoints

**Files:**
- Create: `apps/api/src/products/storefront.service.ts`, `storefront.controller.ts`, `storefront.test.ts`
- Modify: `apps/api/src/products/products.module.ts`

**Interfaces:**
- Produces:
  - `GET /storefront/:slug` → `{ store: { slug; businessName }; products: StorefrontProductCard[] }`, `StorefrontProductCard = { slug; name; photoUrl: string | null; minPriceKobo; maxPriceKobo; soldOut: boolean }`. Only `active` products with ≥ 1 enabled, non-archived variant. `soldOut` = every enabled variant has tracked stock 0.
  - `GET /storefront/:slug/products/:productSlug` → `{ store; product: { slug; name; description; images: { id; largeUrl; smallUrl }[]; options: { name; values }[]; variants: { id; optionValues; title; priceKobo; stock: number | null; imageId: string | null }[] } }`. Disabled/archived variants left out. 404 for hidden/archived products, unknown slugs, or another shop's product slug.

- [ ] **Step 1: Write failing tests** `storefront.test.ts`: hidden and archived products are absent from the list and 404 on the product endpoint; disabled variants are absent; a product whose only enabled tracked variants have stock 0 has `soldOut: true` *(Review Focus 5)*; untracked stock is never sold out; price range is min/max of enabled variants; the product endpoint for shop A's product under shop B's slug → 404.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement** (replaces the old `StorefrontController` in the module).
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(api): storefront product list and product pages`.

---

### Task 7: Orders use variants; stock reduces on payment

**Files:**
- Create: `apps/api/src/orders/stock.ts`, `apps/api/src/orders/stock.test.ts`
- Modify: `packages/shared/src/schemas.ts` (`createOrderSchema` items → `{ variantId, quantity }`), `apps/api/src/orders/orders.service.ts`, `apps/api/src/orders/orders.service.test.ts`, `apps/api/src/payments/payments.service.test.ts`, `apps/api/src/auth/session.guard.test.ts`, `apps/api/src/payouts/payouts.controller.test.ts`, `apps/web/app/[slug]/actions.ts`, `apps/web/app/[slug]/checkout.tsx` (+ test: send `variantId`; this component is replaced in Task 10)

**Interfaces:**
- Produces:
  - `reduceStockForPaidOrder(tx: DbTransaction, orderId: string): Promise<{ shortfall: boolean }>` in `stock.ts`: for each item with a `variantId` whose variant has non-null stock, lock the variant row (`SELECT … FOR UPDATE`), set `stock = greatest(stock - quantity, 0)`; if any had `stock < quantity`, set `orders.stock_shortfall = true` and return `{ shortfall: true }`.
  - `OrdersService.transition` calls `reduceStockForPaidOrder` inside its transaction when `to === "paid"`; after commit, if `shortfall`, `Logger.error("STOCK SHORTFALL on order ${code} (store ${slug}). NEEDS REFUND.")`.
  - `insertOrder` resolves `variantId`s: only variants of this seller's `active` products that are enabled and not archived; tracked stock < requested quantity → 400 `{ message: "<Product – Variant> has only N left", field: "items" }` (0 left → "… is sold out"). Item rows store `productId`, `variantId`, `productName`, `variantTitle`, `unitPriceKobo` (variant's price), `quantity`.
  - Order detail (`findOne` used by `GET /orders/:id`) items include `variantTitle`; order includes `stockShortfall`.

- [ ] **Step 1: Write failing tests**
  - `stock.test.ts`: paid order of 2 with stock 5 → 3; untracked stock stays null; order of 3 with stock 2 → stock 0, `stockShortfall` true; **two orders each for the last unit, both paid → first leaves 0, second flagged, stock never negative** *(Review Focus 4)*; a duplicate "paid" webhook doesn't reduce stock twice (transition to paid is refused the second time).
  - `orders.service.test.ts`: ordering a disabled, archived, hidden-product, or other-shop variant → 400; ordering more than tracked stock → 400 "… has only 2 left"; stock 0 → "… is sold out"; item rows carry `variantTitle` and the variant's price.
- [ ] **Step 2: Run** `pnpm --filter @gbam/api exec vitest run src/orders`. Expected: FAIL.
- [ ] **Step 3: Implement**; switch the existing tests and the web order action to `variantId` (use `createTestProduct(...).variant.id`).
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(api): order by variant; reduce stock on payment and flag shortfalls`.

---

### Task 8: Remove the old product columns

**Files:**
- Modify: `packages/db/src/schema.ts` (drop `price_kobo`, `stock`, `is_active` from `products`), `packages/db/src/seed.ts`, `apps/api/src/test-helpers.ts`, any remaining reference found by `grep -rn "isActive\|products.priceKobo\|products.stock" apps packages --include=*.ts --include=*.tsx`
- Create: `packages/db/migrations/0007_<generated>.sql`

- [ ] **Step 1: Write the failing test**: in `migration.test.ts` add `it("products no longer has price_kobo, stock or is_active")` querying `information_schema.columns`.
- [ ] **Step 2: Run it**. Expected: FAIL.
- [ ] **Step 3: Remove the columns, `pnpm db:generate`, `pnpm db:migrate`, fix every reference.**
- [ ] **Step 4: Run** the test and `pnpm db:seed` (seed must still work). Expected: PASS.
- [ ] **Step 5: Full check + commit**: `refactor(db): drop product price/stock/is_active (now on variants)`.

---

### Task 9: Storefront pages: shop grid and product page

**Files:**
- Modify: `apps/web/lib/api.ts` (types `StorefrontProductCard`, `StorefrontProduct`; `api.storefront(slug)`, `api.storefrontProduct(slug, productSlug)`)
- Modify: `apps/web/app/[slug]/page.tsx` (grid; keeps the `?paid=` banner)
- Create: `apps/web/app/[slug]/[product]/page.tsx`, `apps/web/app/[slug]/[product]/variant-picker.tsx`, `variant-picker.test.tsx`, `apps/web/app/[slug]/[product]/page.test.tsx`
- Modify: `apps/web/app/reserved-slugs.test.ts` only if it enumerates nested routes

**Interfaces:**
- Produces: `VariantPicker({ product, onAdd }: { product: StorefrontProduct; onAdd: (line: BasketLine) => void })`. In this task `onAdd` is wired to a no-op placeholder prop from the page; Task 10 wires the basket. `BasketLine` type is defined in Task 10's `lib/basket.ts`, so this task creates `lib/basket.ts` with **only** the type: `export type BasketLine = { variantId: string; productSlug: string; productName: string; variantTitle: string; priceKobo: number; photoUrl: string | null; quantity: number }`.
- Behaviour: option buttons (`aria-pressed`); a value is crossed out and disabled when no enabled variant with the current other choices has it in stock; the price, "N left" text (shown when tracked and ≤ 5) and main photo follow the chosen variant (variant `imageId` → that image, else image 1); quantity 1..(stock or 99); "Add to order" disabled until every option is chosen. No-option products show no option rows.
- Product page `generateMetadata`: title `"<name> · <businessName>"`, description with the formatted price (or "from …"), `openGraph.images: [largeUrl of image 1]`.
- Gallery: horizontal scroll-snap on phones; on `md:` and up, two columns (gallery with thumbnails left, details right).

- [ ] **Step 1: Write failing tests** `variant-picker.test.tsx`: choosing "M" then "Red" shows that variant's price and its linked photo; a sold-out combination's button is disabled; "Add to order" stays disabled until all options are chosen; for a no-option product the button is enabled at once; quantity can't exceed tracked stock. `page.test.tsx` (render the server component with a mocked `api`): unknown product → `notFound()`; metadata includes the product photo.
- [ ] **Step 2: Run** `pnpm --filter @gbam/web exec vitest run "app/[slug]"`. Expected: FAIL.
- [ ] **Step 3: Implement** the API calls, grid (2 columns on phones, 3–4 on wide screens; "from ₦…" when min ≠ max; "Sold out" label; each card links to `/{slug}/{productSlug}`), product page and picker.
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(web): storefront grid and per-product pages with variant picker`.

---

### Task 10: Basket and order page

**Files:**
- Modify: `apps/web/lib/basket.ts` (add functions), create `apps/web/lib/basket.test.ts`
- Create: `apps/web/app/[slug]/basket-bar.tsx`, `apps/web/app/[slug]/order/page.tsx`, `apps/web/app/[slug]/order/basket-view.tsx`, `basket-view.test.tsx`
- Modify: `apps/web/app/[slug]/actions.ts` (place order from basket lines), `apps/web/app/[slug]/page.tsx` + `[product]/page.tsx` (render `BasketBar`, wire `onAdd`), delete `apps/web/app/[slug]/checkout.tsx` + test

**Interfaces:**
- Produces (`lib/basket.ts`, browser-only, every `localStorage` access in try/catch; on failure it behaves as an empty in-memory basket):
  - `readBasket(shopSlug: string): BasketLine[]`, `writeBasket(shopSlug: string, lines: BasketLine[]): void` (key `gbam-basket:${shopSlug}`)
  - `addLine(lines: BasketLine[], line: BasketLine): BasketLine[]` (same `variantId` → quantities added, capped at 99)
  - `setQuantity(lines, variantId, quantity): BasketLine[]` (0 removes)
  - `basketTotals(lines): { itemCount: number; totalKobo: number }`
  - `useBasket(shopSlug)`: React hook returning `{ lines, add, setQuantity, clear }`, synced across tabs via the `storage` event.
  - `checkBasket(lines, products: StorefrontProduct[]): { line: BasketLine; problem: "gone" | "sold_out" | "only_n_left" | "price_changed"; left?: number; newPriceKobo?: number }[]`.
- `/[slug]/order` page: the basket lives only in the browser, so the page renders `basket-view.tsx`, which calls the server action `checkBasketAction(shopSlug: string, productSlugs: string[]): Promise<StorefrontProduct[]>` for fresh product data and runs `checkBasket` on it; problems are listed above the form ("Leather slides – 42 is sold out. Remove it to continue."); "Place order" disabled while any problem remains. Customer name, phone (existing `nigerianPhoneSchema`), note. On success: existing redirect to the Paystack link flow.
- `/[slug]?paid=GB-XXXX` clears that shop's basket (client effect in `BasketBar`).

- [ ] **Step 1: Write failing tests**
  - `basket.test.ts`: `addLine` merges the same variant; cap 99; `setQuantity(…, 0)` removes; totals; `readBasket` returns `[]` when `localStorage` throws; `checkBasket` flags gone, sold out, only-N-left and price-changed lines.
  - `basket-view.test.tsx`: lines from storage render with totals; a flagged line shows its message and disables "Place order"; removing it enables the button; submitting sends `{ variantId, quantity }` items.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement**; remove `checkout.tsx`.
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(web): basket across product pages and order page`.

---

### Task 11: Dashboard nav, products list, order variant display

**Files:**
- Modify: `apps/web/lib/api.ts` (types `ProductListItem`, `ProductDetail`; calls `listProducts`, `getProduct`, `createProduct`, `updateProduct`, `setProductStatus`, `deleteProduct`, `uploadProductPhoto(formData)`, `deleteProductPhoto(id)`; `OrderDetail` items gain `variantTitle`, order gains `stockShortfall`)
- Modify: `apps/web/app/dashboard/layout.tsx` (nav: Orders `/dashboard`, Products `/dashboard/products`, active state with `aria-current="page"`)
- Create: `apps/web/app/dashboard/products/page.tsx`, `page.test.tsx`
- Modify: `apps/web/app/dashboard/orders/[id]/page.tsx` (+ test): item label `"<productName> – <variantTitle>"` when the title isn't empty; `FormError` with "Stock ran out: refund needed" when `stockShortfall`.

**Interfaces:**
- List row (mockup B): 56 px thumbnail (or a neutral placeholder when there's no photo), name, muted line "N variants · M left" / "Not tracked", price ("₦12,000 – ₦15,000" or single), status pill (`Showing` brand-tint, `Hidden` neutral, `Low stock` when tracked total ≤ 5, using coral-wash + coral-deep text). Filters All / Showing / Hidden via `?show=` search param. Empty state: "No products yet" + "Add your first product" button. Each row links to `/dashboard/products/[id]`.

- [ ] **Step 1: Write failing tests**: products page renders rows with price range, stock text and pills; `?show=hidden` lists only hidden; empty state shows the add button. Order page shows "Ankara wrap dress – M / Red" and the shortfall warning.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(web): dashboard products list and variant names on orders`.

---

### Task 12: Product editor: 3-step add and single-page edit

**Files:**
- Create in `apps/web/app/dashboard/products/editor/`: `editor-state.ts` (+ `editor-state.test.ts`), `photo-picker.tsx`, `options-editor.tsx`, `variant-cards.tsx`, `new-product-steps.tsx` (+ test), `edit-product-form.tsx` (+ test)
- Create: `apps/web/app/dashboard/products/new/page.tsx`, `apps/web/app/dashboard/products/[id]/page.tsx`, `apps/web/app/dashboard/products/actions.ts` (+ `actions.test.ts`)
- Modify: `apps/web/next.config.ts` (`experimental.serverActions.bodySizeLimit: "11mb"`; check the installed Next 16 docs in `node_modules/next/dist/docs/` for the current option name first)

**Interfaces:**
- `editor-state.ts` (pure functions, no React):
  - `type EditorVariant = { id?: string; optionValues: string[]; priceText: string; stockText: string; imageId: string | null; isEnabled: boolean }`
  - `type EditorState = { name: string; description: string; images: { id: string; smallUrl: string }[]; hasOptions: boolean; options: { name: string; values: string[] }[]; variants: EditorVariant[] }`
  - `rebuildVariants(previous: EditorVariant[], oldOptions, newOptions): EditorVariant[]`: builds `combinations(newOptions)`; for each, reuses the previous variant matched by position-wise values, treating a renamed value (same option index and value index) as the same value, so price, stock, photo and id carry over *(Review Focus 2)*.
  - `setAllPrices(variants, priceText)`, `setAllStock(variants, stockText)`.
  - `toProductInput(state): { ok: true; input: ProductInput } | { ok: false; errors: Record<string, string> }`: uses `parseNairaInput`, stock blank → `null`, then `productInputSchema.safeParse`, mapping issue paths to keys like `"variants.2.price"`.
- Server actions (`actions.ts`): `uploadPhotoAction(formData): Promise<{ id: string; smallUrl: string } | { error: string }>`, `deletePhotoAction(id)`, `createProductAction(input): Promise<{ error?: string; fieldErrors?: Record<string,string> }>` (redirects to `/dashboard/products` on success), `updateProductAction(id, input, version)` (409 → the exact stale copy), `setProductStatusAction(id, status)`, `deleteProductAction(id)`.
- `PhotoPicker`: up to 4 tiles; picking a file uploads immediately with a spinner; per-tile error with "Try again"; move left/right buttons (keyboard accessible, no drag-only control); "Main" badge on tile 1; `<input type="file" accept="image/jpeg,image/png,image/webp">` *(Review Focus 1)*.
- `OptionsEditor`: up to 3 options, each a name field + chip input (Enter or comma adds a value, ✕ removes, chips editable by tapping).
- `VariantCards`: one card per combination: title, price, stock, photo choice (thumbnails of the product's images or "Main photo"), On/Off toggle; "Set one price for all" / "Set one stock for all" above. No-option products show a single price + stock row instead.
- `NewProductSteps`: step 1 photos + name + description, step 2 "Does it come in options?" (No → single price/stock; Yes → `OptionsEditor`), step 3 `VariantCards`; Back keeps state; errors from `toProductInput` jump to the first step with an error.
- `EditProductForm`: the same sections on one page, plus Show/Hide and Delete (confirm dialog: "Delete this product? If it has been ordered before, it will be archived instead."). Keeps `version` from `getProduct`.

- [ ] **Step 1: Write failing tests**
  - `editor-state.test.ts`: renaming "M" → "Medium" keeps that variant's price, stock, image and id *(Review Focus 2)*; adding a value adds blank variants and keeps the rest; removing an option merges by keeping the first matching variant's values; `toProductInput` turns "₦12,000" into 1200000 and reports `variants.1.price` for "abc".
  - `new-product-steps.test.tsx`: can't leave step 1 without a photo and a name; Back from step 3 keeps option values; choosing "No" shows one price field; submit calls `createProductAction` with the built input.
  - `edit-product-form.test.tsx`: shows the stale-save message on 409; Delete asks for confirmation.
  - `actions.test.ts`: `updateProductAction` maps API 409 to "This product changed since you opened it. Reload to see the latest.".
- [ ] **Step 2: Run** `pnpm --filter @gbam/web exec vitest run app/dashboard/products`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests**. Expected: PASS.
- [ ] **Step 5: Full check + commit**: `feat(web): add and edit products with photos, options and variants`.
