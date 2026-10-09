"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// A client component because the layout (a server component) does not know which page is open.
// usePathname() tells us, so we can mark the current tab.
export function DashboardNav() {
  const pathname = usePathname();
  // Products covers /dashboard/products and everything under it, Settings likewise.
  // Everything else in the dashboard (the order list and order pages) counts as Orders.
  const onProducts =
    pathname === "/dashboard/products" || pathname.startsWith("/dashboard/products/");
  const onSettings =
    pathname === "/dashboard/settings" || pathname.startsWith("/dashboard/settings/");
  const onHelp = pathname === "/dashboard/help" || pathname.startsWith("/dashboard/help/");

  let ordersCurrent: "page" | undefined = "page";
  let productsCurrent: "page" | undefined = undefined;
  let settingsCurrent: "page" | undefined = undefined;
  let helpCurrent: "page" | undefined = undefined;
  if (onProducts) {
    ordersCurrent = undefined;
    productsCurrent = "page";
  }
  if (onSettings) {
    ordersCurrent = undefined;
    settingsCurrent = "page";
  }
  if (onHelp) {
    ordersCurrent = undefined;
    helpCurrent = "page";
  }

  const tabClass =
    "text-ink-muted focus-visible:outline-brand flex min-h-11 items-center rounded-full px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:bg-brand-tint aria-[current=page]:text-ink";

  return (
    <nav aria-label="Dashboard" className="mb-6 flex gap-2">
      <Link href="/dashboard" aria-current={ordersCurrent} className={tabClass}>
        Orders
      </Link>
      <Link
        href="/dashboard/products"
        aria-current={productsCurrent}
        className={tabClass}
        data-tour="products-tab"
      >
        Products
      </Link>
      <Link href="/dashboard/settings" aria-current={settingsCurrent} className={tabClass}>
        Settings
      </Link>
      <Link href="/dashboard/help" aria-current={helpCurrent} className={tabClass}>
        Help
      </Link>
    </nav>
  );
}
