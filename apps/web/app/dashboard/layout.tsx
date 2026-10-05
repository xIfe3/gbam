import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand/logo";
import { api, type TourStates } from "@/lib/api";
import { DashboardNav } from "./dashboard-nav";
import { PayoutBanner } from "./payout-banner";
import { HelpButton } from "./tours/help-button";
import { ToursProvider } from "./tours/tours-provider";

// Keep private pages out of search results even if someone links to them.
export const metadata: Metadata = { robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // A missing or expired session redirects to /login inside api.currentUser().
  const user = await api.currentUser();
  // Unverified accounts can only reach the verify step.
  if (!user.emailVerified) {
    redirect("/signup/verify");
  }

  // Tour progress, so each page knows whether to open its tour and on which step. If it
  // can't load, tours just don't open by themselves this time (the dashboard still works).
  let tourStates: TourStates | null = null;
  try {
    tourStates = await api.getTours();
  } catch (error) {
    unstable_rethrow(error);
    console.error("loading tours failed", error instanceof Error ? error.message : "error");
  }

  let shopName = user.email;
  let needsPayoutAccount = false;
  if (user.seller) {
    shopName = user.seller.businessName;
    needsPayoutAccount = !user.seller.hasPayoutAccount;
  }

  return (
    <ToursProvider states={tourStates}>
      <div className="mx-auto max-w-3xl px-4 py-6 pb-56">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="focus-visible:outline-brand flex min-h-11 min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Logo size="sm" />
            <span className="text-ink-muted truncate text-sm font-medium">{shopName}</span>
          </Link>
          <div className="flex items-center gap-2">
            <HelpButton />
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-ink focus-visible:outline-brand hover:bg-brand-tint min-h-11 rounded-full border-2 border-brand-tint px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Log out
              </button>
            </form>
          </div>
        </header>
        <DashboardNav />
        {needsPayoutAccount && <PayoutBanner />}
        {children}
      </div>
    </ToursProvider>
  );
}
