"use client";

import Link, { useLinkStatus } from "next/link";

/**
 * The inside of the link. useLinkStatus only works in a component rendered INSIDE a
 * <Link>, and tells us whether the page it points to is still loading.
 */
function Label({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return (
      <>
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
        />
        Opening…
      </>
    );
  }
  return <>{children}</>;
}

/** The green "Add product" button. Shows "Opening…" with a spinner while the form loads. */
export function AddProductLink({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/dashboard/products/new"
      className="bg-brand hover:bg-brand-hover focus-visible:outline-brand inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Label>{children}</Label>
    </Link>
  );
}
