// "use client" = this component runs in the BROWSER. The basket lives in localStorage,
// which the server cannot see, so this page has to be built in the browser.
"use client";

import { DELIVERY_LIMITS, formatNaira } from "@gbam/shared";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/brand/button";
import { TextField } from "@/components/brand/fields";
import { FormError } from "@/components/brand/form-bits";
import type { DeliveryZone, StorefrontProduct } from "@/lib/api";
import { basketTotals, checkBasket, useBasket, type BasketProblem } from "@/lib/basket";
import { LEGAL_LABELS } from "@/lib/site-nav";
import { checkBasketAction, placeOrder, type PlaceOrderState } from "../actions";
import { CopyLinkButton } from "@/app/dashboard/copy-link-button";
import { rememberOrder } from "@/lib/my-orders";
import { SITE_HOST, SITE_URL } from "@/lib/site";

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

type Props = {
  shopSlug: string;
  businessName: string;
  /** The shop's delivery zones (with prices) and pickup note, from the storefront API. */
  delivery: { zones: DeliveryZone[]; pickupNote: string | null };
};

/** "Product – Variant", or just "Product" for a default variant (its title is empty). */
function lineName(line: { productName: string; variantTitle: string }): string {
  if (line.variantTitle === "") {
    return line.productName;
  }
  return `${line.productName} – ${line.variantTitle}`;
}

function problemMessage(item: BasketProblem): string {
  const name = lineName(item.line);
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
  return `${name} now costs ${formatNaira(item.newPriceKobo)}. Use the new price or remove it to continue.`;
}

/** A delivery fee as shown to customers: "₦2,500", or "Free" for ₦0. */
function feeText(feeKobo: number): string {
  if (feeKobo === 0) {
    return "Free";
  }
  return formatNaira(feeKobo);
}

/** An error under a group of choices (TextField shows its own). */
function FieldErrorText({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="text-coral-deep text-sm font-medium">
      {message}
    </p>
  );
}

/** The basket and the order form, at gbam.app/{slug}/order. */
export function BasketView({ shopSlug, businessName, delivery }: Props) {
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

  // The delivery zone the customer picked (its id), or "" for none yet. After a failed
  // submit it starts from what they had picked.
  const [pickedZoneId, setPickedZoneId] = useState("");
  const [restoredFrom, setRestoredFrom] = useState<PlaceOrderState | null>(null);
  if (state.status === "error" && state !== restoredFrom) {
    // React's way to adjust state when something changes: done once per new result.
    setRestoredFrom(state);
    setPickedZoneId(state.values.zoneId);
  }

  // After a successful order the basket is emptied so it is not ordered twice.
  const clearBasket = basket.clear;
  const succeeded = state.status === "success";
  let placedCode = "";
  let placedKey = "";
  if (state.status === "success") {
    placedCode = state.code;
    placedKey = state.trackingKey;
  }
  useEffect(() => {
    if (succeeded) {
      clearBasket();
      // Remember the order on this phone, so /track can list it with nothing to type.
      rememberOrder({
        code: placedCode,
        key: placedKey,
        shopSlug,
        businessName,
        placedAt: new Date().toISOString(),
      });
    }
  }, [succeeded, clearBasket, placedCode, placedKey, shopSlug, businessName]);

  if (state.status === "success") {
    const trackingPath = `/track/${state.code}?k=${encodeURIComponent(state.trackingKey)}`;
    return (
      <section className="bg-brand-tint rounded-2xl p-6 text-center">
        <p className="text-brand-hover text-sm font-bold">Order placed</p>
        <p className="text-ink-muted mt-2 text-sm">Your order code</p>
        <p className="font-display text-ink my-1 text-5xl font-black tracking-wider">
          {state.code}
        </p>
        <p className="text-ink-muted">
          Total {formatNaira(state.totalKobo)}. The seller will message you on WhatsApp with payment
          details.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={trackingPath}
            className="bg-brand hover:bg-brand-hover focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Track this order
          </Link>
          <CopyLinkButton url={`${SITE_URL}${trackingPath}`} label="Copy tracking link" />
        </div>
        <p className="text-ink-muted mt-4 text-sm">
          📸 Take a screenshot of this code to keep it. You can always find this order at{" "}
          <strong>{SITE_HOST}/track</strong> on this phone.
        </p>
        <Link href={`/${shopSlug}`} className={`${smallButtonClasses} mt-4`}>
          Back to {businessName}
        </Link>
      </section>
    );
  }

  // Before the page is hydrated the browser's storage has not been read yet, so an empty
  // basket here would be a lie. Show a neutral message instead.
  if (!basket.ready) {
    return (
      <p role="status" className="text-ink-muted">
        Loading your basket…
      </p>
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

  const hasZones = delivery.zones.length > 0;
  let pickedZone: DeliveryZone | undefined = undefined;
  for (const zone of delivery.zones) {
    if (zone.id === pickedZoneId) {
      pickedZone = zone;
    }
  }
  let deliveryFeeKobo = 0;
  if (pickedZone) {
    deliveryFeeKobo = pickedZone.feeKobo;
  }
  const grandTotalKobo = totalKobo + deliveryFeeKobo;
  // A pickup zone needs no address: the customer collects the order.
  let needsAddress = true;
  if (pickedZone && pickedZone.isPickup) {
    needsAddress = false;
  }

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
  let previous:
    | {
        name: string;
        phone: string;
        email: string;
        note: string;
        zoneId: string;
        address: string;
        landmark: string;
      }
    | undefined = undefined;
  let formError: string | undefined = undefined;
  if (state.status === "error") {
    previous = state.values;
    formError = state.message;
  }

  let submitLabel = `Place order · ${formatNaira(grandTotalKobo)}`;
  const mustPickZone = hasZones && pickedZone === undefined;
  if (mustPickZone) {
    submitLabel = "Choose delivery to continue";
  }
  if (products === null && !checkFailed) {
    submitLabel = "Checking your basket…";
  }
  if (checkFailed) {
    submitLabel = "Could not check your basket";
  }
  if (pending) {
    submitLabel = "Placing order…";
  }
  // A failed re-check leaves old product data behind, so it must block ordering too.
  const canOrder =
    products !== null && !checkFailed && problems.length === 0 && !pending && !mustPickZone;

  // Read out by screen readers when it changes (the button label alone is not announced).
  let statusText = "";
  if (pending) {
    statusText = "Placing order…";
  } else if (products === null && !checkFailed) {
    statusText = "Checking your basket…";
  }

  return (
    <form action={formAction} className="space-y-6">
      <p role="status" className="sr-only">
        {statusText}
      </p>
      {/* aria-live: screen readers announce problems as they appear or go away. */}
      <div aria-live="polite" className="space-y-2">
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
              if (item.problem === "price_changed" && item.newPriceKobo !== undefined) {
                // The server charges the price in its database anyway; this only brings the
                // basket's saved price (and total) in line with it.
                const newPrice = item.newPriceKobo;
                fix = (
                  <button
                    type="button"
                    className={smallButtonClasses}
                    onClick={() => basket.setPrice(item.line.variantId, newPrice)}
                  >
                    Use new price
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
      </div>

      <ul className="divide-brand-tint border-brand-tint divide-y-2 rounded-2xl border-2 bg-white">
        {lines.map((line) => {
          const label = lineName(line);
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
                {line.variantTitle !== "" && (
                  <p className="text-ink-muted text-sm">{line.variantTitle}</p>
                )}
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

      <div className="text-ink space-y-1">
        <p className="flex justify-between">
          <span>
            Items ({itemCount} {itemCount === 1 ? "item" : "items"})
          </span>
          <span>{formatNaira(totalKobo)}</span>
        </p>
        {pickedZone && (
          <p className="flex justify-between">
            <span>Delivery ({pickedZone.name})</span>
            <span>{feeText(pickedZone.feeKobo)}</span>
          </p>
        )}
        <p className="flex justify-between font-bold">
          <span>Total</span>
          <span>{formatNaira(grandTotalKobo)}</span>
        </p>
      </div>

      <input type="hidden" name="items" value={JSON.stringify(items)} />

      {hasZones && (
        // Radio buttons in a fieldset: one choice, and the legend names the group.
        <fieldset className="space-y-2" disabled={pending}>
          <legend className="text-ink mb-2 text-sm font-bold">Delivery</legend>
          {delivery.zones.map((zone) => (
            <label
              key={zone.id}
              className="border-brand-tint has-[:checked]:border-brand has-[:checked]:bg-brand-tint flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-4 py-2"
            >
              <input
                type="radio"
                name="zoneId"
                value={zone.id}
                checked={pickedZoneId === zone.id}
                onChange={() => setPickedZoneId(zone.id)}
                className="accent-brand size-5"
              />
              <span className="text-ink">
                {zone.name} · {feeText(zone.feeKobo)}
              </span>
            </label>
          ))}
          {pickedZone && (
            <input type="hidden" name="expectedFeeKobo" value={String(pickedZone.feeKobo)} />
          )}
          <FieldErrorText message={fieldError("delivery")} />
        </fieldset>
      )}

      {pickedZone && pickedZone.isPickup && delivery.pickupNote && (
        <div className="bg-brand-tint text-ink rounded-xl px-4 py-3 text-sm">
          <p className="font-bold">Where to pick up</p>
          <p>{delivery.pickupNote}</p>
        </div>
      )}

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
        <TextField
          label="Email (optional)"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          hint="We'll email your order code and tracking link."
          defaultValue={previous?.email}
          error={fieldError("email")}
        />
        {needsAddress && (
          <>
            <TextField
              label="Delivery address"
              name="address"
              required
              autoComplete="street-address"
              placeholder="House number, street, area"
              maxLength={DELIVERY_LIMITS.addressMax}
              defaultValue={previous?.address}
              error={fieldError("address")}
            />
            <TextField
              label="Nearest landmark or directions (optional)"
              name="landmark"
              maxLength={DELIVERY_LIMITS.landmarkMax}
              placeholder="e.g. Opposite the filling station"
              defaultValue={previous?.landmark}
              error={fieldError("landmark")}
            />
          </>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-ink text-sm font-bold">Note (optional)</span>
          <textarea
            name="note"
            rows={2}
            maxLength={500}
            defaultValue={previous?.note}
            placeholder="Anything the seller should know"
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
