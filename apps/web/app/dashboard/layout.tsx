/* eslint-disable @next/next/no-img-element -- shop logos and banners are small WebP files from our own storage */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { PendingButton } from "@/components/brand/form-bits";
import { Logo } from "@/components/brand/logo";
import { NoticeBanners } from "@/components/dashboard/notice-banners";
import { NoticeModal } from "@/components/dashboard/notice-modal";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { api, type BellData, type Notices, type TourStates } from "@/lib/api";
import { DashboardNav } from "./dashboard-nav";
import { PayoutBanner } from "./payout-banner";
import { SuspendedBanner } from "./suspended-banner";
import { HelpButton } from "./tours/help-button";
import { ToursProvider } from "./tours/tours-provider";
import { Beacon } from "@/components/beacon";

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
    let reason = "error";
    if (error instanceof Error) {
      reason = error.message;
    }
    console.error("loading tours failed", reason);
  }

  // The bell's notifications. If they can't load, the bell is just left out this time.
  let bell: BellData | null = null;
  try {
    bell = await api.bell();
  } catch (error) {
    unstable_rethrow(error);
    console.error("loading notifications failed");
  }

  // Gbam's banners and modals. If they can't load, the dashboard works without them this time.
  let notices: Notices | null = null;
  try {
    notices = await api.notices();
  } catch (error) {
    unstable_rethrow(error);
    console.error("loading notices failed");
  }
  // One modal at a time, the oldest first. The next shows after this one is acknowledged.
  let modal = null;
  let banners: Notices["banners"] = [];
  if (notices) {
    const firstModal = notices.modals[0];
    if (firstModal) {
      modal = firstModal;
    }
    banners = notices.banners;
  }

  let shopName = user.email;
  let logoUrl: string | null = null;
  let needsPayoutAccount = false;
  let suspended = false;
  if (user.seller) {
    shopName = user.seller.businessName;
    logoUrl = user.seller.logoUrl ?? null;
    needsPayoutAccount = !user.seller.hasPayoutAccount;
    suspended = user.seller.suspended === true;
  }

  return (
    <ToursProvider states={tourStates}>
      <Beacon kind="dashboard" />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            className="focus-visible:outline-brand flex min-h-11 min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Logo size="sm" />
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                className="size-8 shrink-0 rounded-full border border-zinc-200 object-cover"
              />
            )}
            <span className="text-ink-muted truncate text-sm font-medium">{shopName}</span>
          </Link>
          <div className="flex items-center gap-2">
            {bell && <NotificationBell data={bell} />}
            <HelpButton />
            <form action={logoutAction}>
              <PendingButton
                pendingLabel="Logging out…"
                className="text-ink focus-visible:outline-brand hover:bg-brand-tint min-h-11 rounded-full border-2 border-brand-tint px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
              >
                Log out
              </PendingButton>
            </form>
          </div>
        </header>
        <DashboardNav />
        {suspended && <SuspendedBanner />}
        {needsPayoutAccount && <PayoutBanner />}
        <NoticeBanners banners={banners} />
        {children}
        {/* key: a new modal (the next one) starts fresh instead of reusing the last one's state. */}
        {modal && <NoticeModal key={modal.id} notice={modal} />}
      </div>
    </ToursProvider>
  );
}
