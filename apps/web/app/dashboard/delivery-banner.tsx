import { Truck } from "lucide-react";
import Link from "next/link";

/** Shown on the orders page until the shop has at least one delivery zone. */
export function DeliveryBanner() {
  return (
    <aside
      aria-label="Delivery zones"
      className="bg-brand-tint mb-5 flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-ink flex items-start gap-2 text-sm font-medium">
        <Truck size={18} className="text-brand-hover mt-0.5 shrink-0" aria-hidden="true" />
        <span>Add delivery zones so customers pay for delivery when they order.</span>
      </p>
      <Link
        href="/dashboard/settings#delivery"
        className="bg-brand hover:bg-brand-hover focus-visible:outline-brand inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Add delivery zones
      </Link>
    </aside>
  );
}
