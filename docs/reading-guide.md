# Reading guide: the order to read gbam

**The idea:** start with plain TypeScript (no frameworks), then follow ONE order from the
customer's tap all the way to the WhatsApp message. Each stage only uses ideas from
earlier stages. Don't skip ahead. If something feels alien, stop and ask about that line.

Tick the boxes as you go. Roughly 1–2 stages per sitting.

---

## Stage 0: The map (10 min, skim only)

- [ ] `package.json` (root): just read the `scripts`. These are the commands you run.
- [ ] `pnpm-workspace.yaml`: "the packages live in apps/ and packages/".
- [ ] `CLAUDE.md`: the code style rules.

Don't try to understand `turbo.json` yet.

## Stage 1: The rules (plain TypeScript, no frameworks)

The easiest code in the repo, and the most important.

- [ ] `packages/shared/src/order-state.ts`: the 7 statuses and which moves are allowed.
- [ ] `packages/shared/src/order-state.test.ts`: the tests show how it's _used_.
      Read each `it("...")` sentence first, then its code.
- [ ] `packages/shared/src/format.ts`: ₦ formatting and phone numbers.
- [ ] `packages/shared/src/format.test.ts`
- [ ] `packages/shared/src/schemas.ts`: Zod: "what valid input looks like".

**Try it:** in `order-state.ts`, let a seller mark an order `paid`, then run
`pnpm --filter @gbam/shared test`. Watch the test catch it. Undo your change.

## Stage 2: The data

- [ ] `packages/db/src/schema.ts`: the 7 tables. Read `sellers`, `products`, `orders`
      first; skip the `relations(...)` block at the bottom for now.
- [ ] `packages/db/migrations/0000_*.sql`: the SAME tables as real SQL. Compare a
      table here with schema.ts: this is what Drizzle generates.
- [ ] `packages/db/src/client.ts`: how we connect.
- [ ] `packages/db/src/seed.ts`: creates the demo store. Short and concrete.

**Try it:** `pnpm db:studio` opens a browser view of your database. Find the order
you placed and its `order_events` rows.

## Stage 3: Follow an order: the website side

Open `localhost:3000/mama-ngozi` next to the code.

- [ ] `apps/web/app/[slug]/page.tsx`: loads the store (runs on the server).
- [ ] `apps/web/app/[slug]/checkout.tsx`: the basket and form (runs in the browser).
- [ ] `apps/web/app/[slug]/actions.ts`: what happens when you tap "Place order".
- [ ] `apps/web/lib/api.ts`: how the website calls the API.

## Stage 4: Follow the order into the API

- [ ] `apps/api/src/main.ts`: where the API starts (short).
- [ ] `apps/api/src/app.module.ts`: the list of building blocks.
- [ ] `apps/api/src/orders/orders.module.ts`
- [ ] `apps/api/src/orders/orders.controller.ts`: URL → function. Find the `@Post()`
      that the website called in Stage 3.
- [ ] `apps/api/src/common/zod-validation.pipe.ts`: checks the input (Stage 1 schemas!).
- [ ] `apps/api/src/orders/orders.service.ts`: read `createFromStorefront` and
      `insertOrder` only. Skip `transition` until Stage 7.
- [ ] `apps/api/src/orders/order-code.ts`: where "GB-7K3Q" comes from.

## Stage 5: The plumbing (now you've seen it used)

- [ ] `apps/api/src/env.ts`: settings from `.env`, checked at startup.
- [ ] `apps/api/src/infra/infra.module.ts`: **read the comment at the top slowly.**
      It explains "providers", the idea behind every `@Inject...` you've seen.
- [ ] `apps/api/src/common/seller.guard.ts`: the temporary seller login.
- [ ] `apps/api/src/common/domain-errors.filter.ts`: illegal move → HTTP 409.
- [ ] `apps/api/src/health/health.controller.ts`

## Stage 6: Background jobs (the worker)

- [ ] `apps/api/src/notifications/notifications.queue.ts`: putting a job on the queue.
- [ ] `apps/api/src/notifications/notifications.module.ts`
- [ ] `apps/api/src/worker.ts`: the second way the API starts (compare with main.ts).
- [ ] `apps/api/src/worker.module.ts`: compare with app.module.ts. Spot the difference.
- [ ] `apps/api/src/notifications/notifications.processor.ts`: taking jobs off the queue
      and sending WhatsApp messages.

**Try it:** with `pnpm dev` running, place an order and find the `[fake whatsapp]` line
in the terminal. You've now traced the whole journey.

## Stage 7: The seller's side

- [ ] `apps/web/app/dashboard/page.tsx`: the order list.
- [ ] `apps/web/app/dashboard/orders/[id]/page.tsx`: one order. Find `nextStatuses`
      (Stage 1!) deciding which buttons appear.
- [ ] `apps/web/app/dashboard/orders/[id]/status-actions.tsx`: the buttons.
- [ ] `apps/web/app/dashboard/actions.ts`: what a button press does.
- [ ] Back to `orders.service.ts`: now read `transition`, including the row lock.

## Stage 8: Money (Paystack)

- [ ] `packages/integrations/src/paystack.ts`: talking to Paystack, plus the fake.
- [ ] `packages/integrations/src/whatsapp.ts`: talking to WhatsApp, plus the fake.
- [ ] `apps/api/src/integrations/integrations.module.ts`: picks real or fake.
- [ ] `apps/api/src/payments/payments.service.ts`: read `ensurePaymentLink` first.
- [ ] `apps/api/src/payments/paystack-webhook.controller.ts`: Paystack calling us.
- [ ] `apps/api/src/payments/payments.queue.ts` and `payments.processor.ts`
- [ ] `payments.service.ts` again: now read `confirm`.
- [ ] `apps/api/src/scripts/simulate-payment.ts`: how we fake a payment locally.
- [ ] `docs/integrations-setup.md`

**Try it:** request payment on an order, run `pnpm simulate:payment GB-XXXX`, and watch
the order turn **Paid** in the dashboard.

## Stage 9: Tests as documentation

- [ ] `apps/api/src/orders/orders.service.test.ts`
- [ ] `apps/api/src/payments/payments.service.test.ts`

Each `it("...")` is one rule the system guarantees. Reading these is a good self-check:
can you point to the code that makes each one true?

## Stage 10: Shipping (last; optional until you deploy)

- [ ] `packages/db/src/migrate.ts`
- [ ] `apps/api/Dockerfile`
- [ ] `apps/web/Dockerfile`
- [ ] `docker/docker-compose.prod.yml`

---

## Safe to skip (config, rarely edited)

`packages/config/**`, every `eslint.config.*`, `tsup.config.ts`, `tsconfig*.json`,
`vitest.config.ts`, `next.config.ts`, `postcss.config.mjs`, `drizzle.config.ts`,
`packages/db/migrations/meta/**`, `pnpm-lock.yaml`, `AGENTS.md`, `next-env.d.ts`.
Come back to them only when something about building or tooling breaks.
