"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export type ActiveCounts = {
  sellersInDashboard: number;
  shoppers: number;
  checkout: number;
  admins: number;
  topShops: { slug: string; count: number }[];
};

const EVERY_MS = 5_000;

/**
 * Who is on Gbam right now (anyone whose page beat in the last 2 minutes). Asks again every
 * 5 seconds through `load` (a server action), so the numbers move without reloading the page.
 */
export function ActiveNow({
  initial,
  load,
}: {
  initial: ActiveCounts;
  load: () => Promise<ActiveCounts>;
}) {
  const [counts, setCounts] = useState(initial);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const latest = await load();
        setCounts(latest);
        setFailed(false);
      } catch {
        // Keep showing the last numbers; the next tick tries again.
        setFailed(true);
      }
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [load]);

  const tiles = [
    { label: "Shoppers", value: counts.shoppers },
    { label: "At checkout", value: counts.checkout },
    { label: "Sellers in dashboard", value: counts.sellersInDashboard },
    { label: "Admins", value: counts.admins },
  ];

  return (
    <section
      aria-labelledby="active-now"
      className="rounded-xl border border-zinc-200 bg-white p-5"
    >
      <h2 id="active-now" className="text-ink font-bold">
        Active now <span className="text-ink-muted text-sm font-normal">(last 2 minutes)</span>
      </h2>
      {failed && (
        <p role="status" className="text-coral-deep mt-1 text-sm">
          Couldn&apos;t refresh. Showing the last numbers.
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label}>
            <dt className="text-ink-muted text-sm">{tile.label}</dt>
            <dd className="font-display text-ink text-3xl font-black">{tile.value}</dd>
          </div>
        ))}
      </dl>
      {counts.topShops.length > 0 && (
        <div className="mt-4">
          <h3 className="text-ink-muted text-sm font-bold">Busiest shops right now</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {counts.topShops.map((shop) => (
              <li key={shop.slug} className="flex justify-between gap-3">
                <Link href={`/${shop.slug}`} className="text-brand font-bold">
                  {shop.slug}
                </Link>
                <span>{shop.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
