"use client";

import { formatNaira } from "@gbam/shared";
import { useActionState, useState } from "react";
import type { Storefront } from "@/lib/api";
import { placeOrder, type PlaceOrderState } from "./actions";

type Props = { slug: string; products: Storefront["products"] };

export function Checkout({ slug, products }: Props) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [state, formAction, pending] = useActionState<PlaceOrderState, FormData>(
    placeOrder.bind(null, slug),
    { status: "idle" },
  );

  // Display only. The API recomputes the total from DB prices.
  const total = products.reduce((sum, p) => sum + p.priceKobo * (quantities[p.id] ?? 0), 0);
  const itemCount = Object.values(quantities).reduce((a, b) => a + b, 0);
  const setQty = (id: string, qty: number) =>
    setQuantities((q) => ({ ...q, [id]: Math.max(0, Math.min(99, qty)) }));

  if (state.status === "success") {
    return (
      <section className="rounded-xl border border-emerald-200 bg-brand-50 p-6 text-center">
        <p className="text-sm text-emerald-800">Order placed</p>
        <p className="my-2 font-mono text-3xl font-bold tracking-wider">{state.code}</p>
        <p className="text-zinc-700">
          Total {formatNaira(state.totalKobo)}. The seller will message you on WhatsApp with payment
          details. Quote your order code if you need help.
        </p>
      </section>
    );
  }

  const fieldError = (name: string) =>
    state.status === "error" ? state.fieldErrors?.[name]?.[0] : undefined;
  const previous = state.status === "error" ? state.values : undefined;

  return (
    <form action={formAction} className="space-y-6">
      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
        {products.map((p) => {
          const qty = quantities[p.id] ?? 0;
          return (
            <li key={p.id} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                {p.description && <p className="text-sm text-zinc-500">{p.description}</p>}
                <p className="text-sm font-semibold text-zinc-700">{formatNaira(p.priceKobo)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Remove one ${p.name}`}
                  onClick={() => setQty(p.id, qty - 1)}
                  disabled={qty === 0}
                  className="size-9 rounded-full border border-zinc-300 text-lg disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-6 text-center tabular-nums" aria-live="polite">
                  {qty}
                </span>
                <button
                  type="button"
                  aria-label={`Add one ${p.name}`}
                  onClick={() => setQty(p.id, qty + 1)}
                  className="size-9 rounded-full border border-zinc-300 text-lg"
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
        <Field
          label="Your name"
          name="name"
          autoComplete="name"
          defaultValue={previous?.name}
          error={fieldError("name")}
        />
        <Field
          label="WhatsApp number"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="0803 123 4567"
          autoComplete="tel"
          defaultValue={previous?.phone}
          error={fieldError("phone")}
        />
        <label className="block">
          <span className="text-sm font-medium">Note (optional)</span>
          <textarea
            name="note"
            rows={2}
            maxLength={500}
            defaultValue={previous?.note}
            placeholder="Delivery address, preferences…"
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2"
          />
        </label>
      </fieldset>

      {state.status === "error" && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || itemCount === 0}
        className="w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending
          ? "Placing order…"
          : itemCount === 0
            ? "Add items to order"
            : `Place order · ${formatNaira(total)}`}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  ...input
}: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        required
        {...input}
        aria-invalid={!!error}
        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 aria-invalid:border-rose-500"
      />
      {error && <span className="mt-1 block text-sm text-rose-600">{error}</span>}
    </label>
  );
}
