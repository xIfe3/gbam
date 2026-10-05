// "use client" = this component runs in the BROWSER. The basket lives in localStorage,
// which the server cannot see, so this page has to be built in the browser.
"use client";

import { formatNaira } from "@gbam/shared";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/brand/button";
import { TextField } from "@/components/brand/fields";
import { FormError } from "@/components/brand/form-bits";
import type { StorefrontProduct } from "@/lib/api";
import { basketTotals, checkBasket, useBasket, type BasketProblem } from "@/lib/basket";
import { LEGAL_LABELS } from "@/lib/site-nav";
import { checkBasketAction, placeOrder, type PlaceOrderState } from "../actions";

// 44px round +/- buttons with a visible keyboard focus ring.
const stepperClasses =
  "text-ink border-brand-tint hover:bg-coral-wash focus-visible:outline-brand flex size-11 items-center justify-center rounded-full border-2 bg-white text-xl focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40";

const smallButtonClasses =
  "text-brand focus-visible:outline-brand inline-flex min-h-11 items-center font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2";

// Legal pages open in a new tab so the customer keeps their basket and typed details.
const newTabProps = { target: "_blank", rel: "noopener noreferrer" };

// inline-flex + min-h-11 gives a tap area at least 44px high.
const legalLinkClasses =
  "inline-flex min-h-11 items-center text-brand focus-visible:outline-brand font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2";

type Props = { shopSlug: string; businessName: string };

function problemMessage(item: BasketProblem): string {
  const name = `${item.line.productName} – ${item.line.variantTitle}`;
  if (item.problem === "gone") {
    return `${name} is no longer available. Remove it to continue.`;
  }
  if (item.problem === "sold_out") {
    return `${name} is sold out. Remove it to continue.`;
  }
  if (item.problem === "only_n_left") {
    return `${name} has only ${item.left} left. Lower the quantity or remove it to continue.`;
  }
  if (item.newPriceKobo === undefined) {
    throw new Error("A price_changed problem needs newPriceKobo");
  }
  return `${name} now costs ${formatNaira(item.newPriceKobo)}. Remove it and add it again to continue.`;
}

/** The basket and the order form, at gbam.app/{slug}/order. */
export function BasketView({ shopSlug, businessName }: Props) {
  const basket = useBasket(shopSlug);
  const lines = basket.lines;

  // Fresh product data from the server. null = still loading (or the check failed).
  const [products, setProducts] = useState<StorefrontProduct[] | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);

  // Only the list of product slugs matters for the check, so it is turned into one text
  // value: the effect below re-runs when a product is added or removed, not on every re-draw.
  const slugList: string[] = [];
  for (const line of lines) {
    if (!slugList.includes(line.productSlug)) {
      slugList.push(line.productSlug);
    }
  }
  const slugKey = slugList.join(",");

  useEffect(() => {
    if (slugKey === "") {
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const fresh = await checkBasketAction(shopSlug, slugKey.split(","));
        if (!cancelled) {
          setProducts(fresh);
          setCheckFailed(false);
        }
      } catch {
        if (!cancelled) {
          setCheckFailed(true);
        }
      }
    }
    void load();
    // If the effect re-runs or the page closes first, ignore the late answer.
    return () => {
      cancelled = true;
    };
  }, [shopSlug, slugKey]);

  // useActionState wires the form to the `placeOrder` server action:
  // state = what it last returned, formAction = pass to <form action>, pending = sending.
  const [state, formAction, pending] = useActionState<PlaceOrderState, FormData>(
    placeOrder.bind(null, shopSlug),
    { status: "idle" },
  );

  // After a successful order the basket is emptied so it is not ordered twice.
  const clearBasket = basket.clear;
  const succeeded = state.status === "success";
  useEffect(() => {
    if (succeeded) {
      clearBasket();
    }
  }, [succeeded, clearBasket]);

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
        <Link href={`/${shopSlug}`} className={`${smallButtonClasses} mt-4`}>
          Back to {businessName}
        </Link>
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className="border-brand-tint rounded-2xl border-2 border-dashed p-6 text-center">
        <p className="text-ink-muted">Your basket is empty.</p>
        <Link href={`/${shopSlug}`} className={`${smallButtonClasses} mt-2`}>
          Back to {businessName}
        </Link>
      </section>
    );
  }

  let problems: BasketProblem[] = [];
  if (products !== null) {
    problems = checkBasket(lines, products);
  }
  const { itemCount, totalKobo } = basketTotals(lines);

  // The items sent to the server: only the variant and how many. The server looks up
  // prices itself, so nothing the browser says about money is trusted.
  const items: { variantId: string; quantity: number }[] = [];
  for (const line of lines) {
    items.push({ variantId: line.variantId, quantity: line.quantity });
  }

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

  // React clears the form after a server action, so a failed submit puts the input back.
  let previous: { name: string; phone: string; note: string } | undefined = undefined;
  let formError: string | undefined = undefined;
  if (state.status === "error") {
    previous = state.values;
    formError = state.message;
  }

  let submitLabel = `Place order · ${formatNaira(totalKobo)}`;
  if (products === null && !checkFailed) {
    submitLabel = "Checking your basket…";
  }
  if (checkFailed) {
    submitLabel = "Could not check your basket";
  }
  if (pending) {
    submitLabel = "Placing order…";
  }
  const canOrder = products !== null && problems.length === 0 && !pending;

  return (
    <form action={formAction} className="space-y-6">
      {problems.length > 0 && (
        <ul className="space-y-2">
          {problems.map((item) => {
            let fix: React.ReactNode = null;
            if (item.problem === "only_n_left" && item.left !== undefined) {
              const left = item.left;
              fix = (
                <button
                  type="button"
                  className={smallButtonClasses}
                  onClick={() => basket.setQuantity(item.line.variantId, left)}
                >
                  Change to {left}
                </button>
              );
            }
            return (
              <li
                key={item.line.variantId}
                className="bg-coral-wash text-ink border-coral-tint rounded-lg border px-4 py-3 text-sm font-medium"
              >
                <p>{problemMessage(item)}</p>
                {fix}
              </li>
            );
          })}
        </ul>
      )}
      {checkFailed && (
        <FormError message="We could not check your basket just now. Refresh the page to try again." />
      )}

      <ul className="divide-brand-tint border-brand-tint divide-y-2 rounded-2xl border-2 bg-white">
        {lines.map((line) => {
          const label = `${line.productName} – ${line.variantTitle}`;
          return (
            <li key={line.variantId} className="flex items-center gap-3 p-4">
              <div className="bg-blush size-16 shrink-0 overflow-hidden rounded-xl">
                {line.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.photoUrl}
                    alt=""
                    width={64}
                    height={64}
                    className="size-full object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-ink font-bold">{line.productName}</p>
                <p className="text-ink-muted text-sm">{line.variantTitle}</p>
                <p className="text-ink text-sm font-bold">{formatNaira(line.priceKobo)}</p>
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  onClick={() => basket.setQuantity(line.variantId, 0)}
                  className={smallButtonClasses}
                >
                  Remove
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Remove one ${label}`}
                  onClick={() => basket.setQuantity(line.variantId, line.quantity - 1)}
                  className={stepperClasses}
                >
                  −
                </button>
                <span
                  className="text-ink w-6 text-center font-bold tabular-nums"
                  aria-live="polite"
                >
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Add one ${label}`}
                  onClick={() => basket.setQuantity(line.variantId, line.quantity + 1)}
                  className={stepperClasses}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-ink flex justify-between font-bold">
        <span>
          Total ({itemCount} {itemCount === 1 ? "item" : "items"})
        </span>
        <span>{formatNaira(totalKobo)}</span>
      </p>

      <input type="hidden" name="items" value={JSON.stringify(items)} />

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

      <FormError message={formError} />

      {/* A grid makes the button stretch to the full width. */}
      <div className="grid">
        <Button type="submit" variant="primary" size="lg" disabled={!canOrder}>
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
