// "use client" = this component runs in the BROWSER (it needs clicks and state).
// Files without it run only on the server.
"use client";

import { formatNaira } from "@gbam/shared";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/brand/button";
import { TextField } from "@/components/brand/fields";
import type { Storefront } from "@/lib/api";
import { LEGAL_LABELS } from "@/lib/site-nav";
import { placeOrder, type PlaceOrderState } from "./actions";

// 44px round +/- buttons with a visible keyboard focus ring.
const stepperClasses =
  "text-ink border-brand-tint hover:bg-coral-wash focus-visible:outline-brand flex size-11 items-center justify-center rounded-full border-2 bg-white text-xl focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";

// Legal pages open in a new tab so the customer keeps their basket and typed details.
const newTabProps = { target: "_blank", rel: "noopener noreferrer" };

// inline-flex + min-h-11 gives a tap area at least 44px high.
const legalLinkClasses =
  "inline-flex min-h-11 items-center text-brand focus-visible:outline-brand font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2";

type Props = { slug: string; products: Storefront["products"] };

/** Basket (+/− per product) and the checkout form. */
export function Checkout({ slug, products }: Props) {
  // useState: a value React remembers between re-renders. Here: productId → quantity.
  // Calling setQuantities(...) updates it and re-draws the component.
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // useActionState wires the form to the `placeOrder` server action:
  // - state:      what placeOrder last returned (idle / error / success)
  // - formAction: pass to <form action={...}>
  // - pending:    true while the server is working
  // `.bind(null, slug)` pre-fills placeOrder's first argument with this store's slug.
  const [state, formAction, pending] = useActionState<PlaceOrderState, FormData>(
    placeOrder.bind(null, slug),
    { status: "idle" },
  );

  // Basket total and item count, for display only. The API recomputes the real total
  // from database prices, so changing these in the browser can't change what's charged.
  let total = 0;
  let itemCount = 0;
  for (const product of products) {
    const quantity = quantityOf(product.id);
    total = total + product.priceKobo * quantity;
    itemCount = itemCount + quantity;
  }

  function quantityOf(productId: string): number {
    const quantity = quantities[productId];
    if (quantity === undefined) {
      return 0;
    }
    return quantity;
  }

  function setQuantity(productId: string, quantity: number) {
    // Keep it between 0 and 99.
    let safeQuantity = quantity;
    if (safeQuantity < 0) safeQuantity = 0;
    if (safeQuantity > 99) safeQuantity = 99;

    // Copy the old object and change one entry. (React needs a NEW object to notice.)
    const updated = { ...quantities };
    updated[productId] = safeQuantity;
    setQuantities(updated);
  }

  if (state.status === "success") {
    return (
      <section className="bg-brand-tint rounded-2xl p-6 text-center">
        <p className="text-brand-hover text-sm font-bold">Order placed</p>
        <p className="font-display text-ink my-2 text-4xl font-black tracking-wider">
          {state.code}
        </p>
        <p className="text-ink-muted">
          Total {formatNaira(state.totalKobo)}. The seller will message you on WhatsApp with payment
          details. Quote your order code if you need help.
        </p>
      </section>
    );
  }

  // After a failed submit: the error for one field, and what the customer had typed
  // (React clears the form after a server action, so we put their input back).
  function fieldError(fieldName: string): string | undefined {
    if (state.status !== "error" || !state.fieldErrors) {
      return undefined;
    }
    const errors = state.fieldErrors[fieldName];
    if (!errors) {
      return undefined;
    }
    return errors[0];
  }

  let previous: { name: string; phone: string; note: string } | undefined = undefined;
  if (state.status === "error") {
    previous = state.values;
  }

  let submitLabel = `Place order · ${formatNaira(total)}`;
  if (itemCount === 0) {
    submitLabel = "Add items to order";
  }
  if (pending) {
    submitLabel = "Placing order…";
  }

  return (
    <form action={formAction} className="space-y-6">
      <ul className="divide-brand-tint border-brand-tint divide-y-2 rounded-2xl border-2 bg-white">
        {products.map((p) => {
          const qty = quantityOf(p.id);
          return (
            <li key={p.id} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-ink font-bold">{p.name}</p>
                {p.description && <p className="text-ink-muted text-sm">{p.description}</p>}
                <p className="text-ink text-sm font-bold">{formatNaira(p.priceKobo)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Remove one ${p.name}`}
                  onClick={() => setQuantity(p.id, qty - 1)}
                  disabled={qty === 0}
                  className={stepperClasses}
                >
                  −
                </button>
                <span
                  className="text-ink w-6 text-center font-bold tabular-nums"
                  aria-live="polite"
                >
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label={`Add one ${p.name}`}
                  onClick={() => setQuantity(p.id, qty + 1)}
                  className={stepperClasses}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <input type="hidden" name="items" value={JSON.stringify(quantities)} />

      <fieldset className="space-y-3" disabled={pending}>
        <TextField
          label="Your name"
          name="name"
          required
          autoComplete="name"
          defaultValue={previous?.name}
          error={fieldError("name")}
        />
        <TextField
          label="WhatsApp number"
          name="phone"
          type="tel"
          required
          inputMode="tel"
          placeholder="0803 123 4567"
          autoComplete="tel"
          defaultValue={previous?.phone}
          error={fieldError("phone")}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-sm font-bold">Note (optional)</span>
          <textarea
            name="note"
            rows={2}
            maxLength={500}
            defaultValue={previous?.note}
            placeholder="Delivery address, preferences…"
            className="text-ink placeholder:text-ink-subtle border-brand-tint focus-visible:outline-brand w-full rounded-xl border-2 bg-white px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2"
          />
        </label>
      </fieldset>

      {state.status === "error" && (
        <p
          role="alert"
          className="bg-coral-wash text-ink border-coral-tint rounded-lg border px-4 py-3 text-sm font-medium"
        >
          {state.message}
        </p>
      )}

      {/* A grid makes the button stretch to the full width. */}
      <div className="grid">
        <Button type="submit" variant="primary" size="lg" disabled={pending || itemCount === 0}>
          {submitLabel}
        </Button>
      </div>

      <p className="text-ink-muted text-sm">
        By ordering you agree to Gbam&apos;s{" "}
        <Link href="/legal/terms" className={legalLinkClasses} {...newTabProps}>
          {LEGAL_LABELS.terms}
          <span className="sr-only"> (opens in a new tab)</span>
        </Link>{" "}
        and{" "}
        <Link href="/legal/privacy" className={legalLinkClasses} {...newTabProps}>
          {LEGAL_LABELS.privacy}
          <span className="sr-only"> (opens in a new tab)</span>
        </Link>
        .
      </p>
    </form>
  );
}
