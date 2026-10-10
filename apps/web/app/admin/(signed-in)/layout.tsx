import type { Metadata } from "next";
import Link from "next/link";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { visibleNav } from "@/components/admin/admin-nav";
import { PendingButton } from "@/components/brand/form-bits";
import { Logo } from "@/components/brand/logo";
import { adminApi } from "@/lib/admin-api";
import { adminLogoutAction } from "./actions";
import { Beacon } from "@/components/beacon";

// Staff pages: never in search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Every signed-in admin page: menu on the left (a slide-in menu on phones), page on the right. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // No or expired session → /admin/login (inside adminApi).
  const me = await adminApi.me();
  const nav = visibleNav(me);

  let roleName = "Superadmin";
  if (!me.isSuperadmin) {
    roleName = me.role?.name ?? "No role";
  }

  const links = nav.map((item) => (
    <li key={item.href}>
      <Link
        href={item.href}
        className="text-ink flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-white"
      >
        {item.label}
      </Link>
    </li>
  ));

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:gap-6 md:py-6">
      {/* Phones: a slim top bar, and the menu slides in from the side. */}
      <AdminMobileNav
        items={nav}
        name={me.name}
        roleName={roleName}
        signOut={
          <form action={adminLogoutAction} className="mt-2">
            <PendingButton pendingLabel="Signing out…" className="min-h-11 font-bold underline">
              Sign out
            </PendingButton>
          </form>
        }
      />
      {/* Wider screens: the menu is always open on the left. */}
      <aside className="hidden md:block md:w-56 md:shrink-0">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link href="/admin" className="flex min-h-11 items-center gap-2">
            <Logo size="sm" />
            <span className="text-ink-muted text-sm font-bold">Admin</span>
          </Link>
        </div>
        <ul className="space-y-1">{links}</ul>
        <div className="text-ink-muted mt-6 border-t border-zinc-200 pt-4 text-sm">
          <p className="text-ink font-medium">{me.name}</p>
          <p>{roleName}</p>
          <form action={adminLogoutAction} className="mt-2">
            <PendingButton pendingLabel="Signing out…" className="min-h-11 font-bold underline">
              Sign out
            </PendingButton>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
      <Beacon kind="admin" />
    </div>
  );
}
