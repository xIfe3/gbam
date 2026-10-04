import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { Button } from "@/components/brand/button";
import { FormError } from "@/components/brand/form-bits";
import { api, ApiError, type Bank } from "@/lib/api";
import { SignupFrame } from "../frame";
import { BankForm } from "./bank-form";

export const metadata: Metadata = {
  title: "Get paid",
  description: "Add the bank account where your Gbam payouts will go.",
};

/** The bank list, or null when it can't be loaded right now (the page offers a retry). */
async function loadBanks(): Promise<Bank[] | null> {
  try {
    return await api.listBanks();
  } catch (error) {
    // Session redirects from lib/api must reach Next.
    unstable_rethrow(error);
    let status = "error";
    if (error instanceof ApiError) {
      status = String(error.status);
    }
    console.error(`bank list failed with status ${status}`);
    return null;
  }
}

export default async function GetPaidPage() {
  // No session: log in first (api redirects). Unverified: finish step 2 first.
  const user = await api.currentUser();
  if (!user.emailVerified) {
    redirect("/signup/verify");
  }
  // Nothing to do: no shop (admin), or the payout account already exists.
  if (!user.seller || user.seller.hasPayoutAccount) {
    redirect("/dashboard");
  }

  const banks = await loadBanks();

  return (
    <SignupFrame
      step={3}
      title="Get paid"
      subtitle="Where should we send your money? Customers pay through Paystack, and your share goes straight to this account."
    >
      {banks === null && (
        <div className="flex flex-col items-start gap-4">
          <FormError message="We couldn't load the list of banks. Please try again in a minute." />
          <div className="flex flex-wrap gap-3">
            {/* This page is rendered per request, so opening it again asks for the list again. */}
            <Button variant="primary" href="/signup/get-paid">
              Try again
            </Button>
            <Button variant="ghost" href="/dashboard">
              Skip for now
            </Button>
          </div>
        </div>
      )}
      {banks !== null && <BankForm banks={banks} />}
    </SignupFrame>
  );
}
