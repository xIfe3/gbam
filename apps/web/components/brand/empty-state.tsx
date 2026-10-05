/**
 * The card shown when a list has nothing in it yet: a small drawing, a headline,
 * a sentence of help, and (usually) one button that fixes it.
 */
export function EmptyState({
  art,
  title,
  description,
  children,
}: {
  art?: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-brand-tint rounded-2xl border-2 bg-white px-5 py-8 text-center">
      {art && <div className="mb-3 flex justify-center">{art}</div>}
      <h2 className="font-display text-ink text-xl font-black">{title}</h2>
      <p className="text-ink-muted mx-auto mt-2 max-w-sm">{description}</p>
      {children && <div className="mt-5 flex flex-col items-center gap-3">{children}</div>}
    </section>
  );
}

/** A phone showing a product card, a green tick and a naira coin. Decorative only. */
export function ProductsArt() {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" aria-hidden="true" focusable="false">
      <rect x="34" y="4" width="52" height="88" rx="10" className="fill-ink" />
      <rect x="39" y="12" width="42" height="72" rx="5" className="fill-blush" />
      <rect x="44" y="18" width="32" height="26" rx="4" className="fill-coral-tint" />
      <rect x="44" y="48" width="22" height="5" rx="2.5" className="fill-ink" />
      <rect x="44" y="57" width="14" height="5" rx="2.5" className="fill-brand" />
      <rect x="44" y="68" width="32" height="9" rx="4.5" className="fill-brand" />
      <circle cx="92" cy="22" r="13" className="fill-brand" />
      <path
        d="M86 22l4 4 8-8"
        stroke="white"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="70" r="9" className="fill-coral" />
      <text x="22" y="74" fontSize="10" textAnchor="middle" fill="white" fontWeight="700">
        ₦
      </text>
    </svg>
  );
}

/** A chat bubble with a naira coin: "orders come in through WhatsApp". Decorative only. */
export function OrdersArt() {
  return (
    <svg width="96" height="72" viewBox="0 0 96 72" aria-hidden="true" focusable="false">
      <rect x="10" y="10" width="60" height="40" rx="12" className="fill-brand-tint" />
      <path d="M22 50l-6 12 16-12" className="fill-brand-tint" />
      <rect x="20" y="22" width="32" height="5" rx="2.5" className="fill-brand" />
      <rect x="20" y="32" width="22" height="5" rx="2.5" className="fill-brand" opacity="0.6" />
      <circle cx="76" cy="20" r="12" className="fill-coral" />
      <text x="76" y="24" fontSize="11" textAnchor="middle" fill="white" fontWeight="700">
        ₦
      </text>
    </svg>
  );
}
