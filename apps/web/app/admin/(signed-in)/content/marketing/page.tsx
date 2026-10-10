import { MARKETING_PAGE_LABELS, MARKETING_PAGES } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Marketing pages · Admin" };

/** The marketing pages whose words and photos can be edited. */
export default function MarketingPagesPage() {
  return (
    <div className="space-y-5">
      <Link href="/admin/content" className="text-sm font-bold underline">
        ← All content
      </Link>
      <h1 className="font-display text-ink text-3xl font-black">Marketing pages</h1>
      <p className="text-ink-muted text-sm">
        Change the words and photos in each page&apos;s fixed spots. The layout stays the same, so
        nothing can break. Pricing isn&apos;t here: its headline comes from the fee in Settings.
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {MARKETING_PAGES.map((page) => (
          <li key={page}>
            <Link
              href={`/admin/content/marketing/${page}`}
              className="block rounded-xl border border-zinc-200 bg-white p-4 font-bold hover:border-zinc-300"
            >
              {MARKETING_PAGE_LABELS[page]}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
