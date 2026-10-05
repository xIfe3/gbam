"use client";

import { useRouter } from "next/navigation";

/** Asks Next to fetch this page's data again, without a full page reload. */
export function TryAgainButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="bg-brand hover:bg-brand-hover focus-visible:outline-brand mt-4 inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      Try again
    </button>
  );
}
