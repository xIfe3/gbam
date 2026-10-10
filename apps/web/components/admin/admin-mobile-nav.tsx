"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";

/**
 * The admin menu on phones: a slim top bar with a Menu button, and the menu sliding in from
 * the side over the page (instead of a list pushing everything down). Picking a page, ✕, a
 * tap outside or Escape closes it. Wide screens use the sidebar instead (see the layout).
 */
export function AdminMobileNav({
  items,
  name,
  roleName,
  signOut,
}: {
  items: { href: string; label: string }[];
  name: string;
  roleName: string;
  /** The sign-out form, from the layout (it posts to a server action). */
  signOut?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between gap-2">
        <Link href="/admin" className="flex min-h-11 items-center gap-2">
          <Logo size="sm" />
          <span className="text-ink-muted text-sm font-bold">Admin</span>
        </Link>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="min-h-11 rounded-full border-2 border-zinc-300 bg-white px-5 font-bold"
        >
          Menu
        </button>
      </div>

      {open && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin menu"
            className="drawer-in fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-4 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <Logo size="sm" />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex size-11 items-center justify-center rounded-full text-xl"
              >
                ✕
              </button>
            </div>
            <ul className="space-y-1">
              {items.map((item) => {
                let current: "page" | undefined = undefined;
                let classes = "text-ink flex min-h-11 items-center rounded-lg px-3 font-medium";
                if (pathname === item.href) {
                  current = "page";
                  classes =
                    "bg-brand-tint text-ink flex min-h-11 items-center rounded-lg px-3 font-bold";
                }
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current}
                      onClick={() => setOpen(false)}
                      className={classes}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="text-ink-muted mt-auto border-t border-zinc-200 pt-4 text-sm">
              <p className="text-ink font-medium">{name}</p>
              <p>{roleName}</p>
              {signOut}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
