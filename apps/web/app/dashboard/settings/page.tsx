import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { BankForm } from "@/app/(auth)/signup/get-paid/bank-form";
import { FormError, FormNotice } from "@/components/brand/form-bits";
import { api, ApiError, type Bank } from "@/lib/api";
import { SITE_HOST } from "@/lib/site";
import { CloseAccountForm, EmailsForm, PasswordForm, ShopForm } from "./settings-forms";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your shop details, payout bank account, emails, password and account.",
};

/** The bank list, or null when it can't be loaded right now (the rest of the page still works). */
async function loadBanks(): Promise<Bank[] | null> {
  try {
    return await api.listBanks();
  } catch (error) {
    unstable_rethrow(error);
    let status = "error";
    if (error instanceof ApiError) {
      status = String(error.status);
    }
    console.error(`bank list failed with status ${status}`);
    return null;
  }
}

const sectionClass = "rounded-xl border border-zinc-200 bg-white p-5";

export default async function SettingsPage(props: PageProps<"/dashboard/settings">) {
  const searchParams = await props.searchParams;
  const settings = await api.getSettings();
  // Only needed to change the account, but the list is cached by the API, so it's cheap.
  let banks: Bank[] | null = null;
  if (settings.payoutAccount) {
    banks = await loadBanks();
  }
  let bankNotice: string | undefined = undefined;
  if (searchParams.saved === "bank") {
    bankNotice = "Bank account changed. New payments will go to it.";
  }

  return (
    <main className="space-y-6">
      <h1 className="font-display text-ink text-3xl font-black">Settings</h1>

      <section aria-labelledby="shop-heading" className={sectionClass}>
        <h2 id="shop-heading" className="mb-1 font-semibold">
          Shop
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Your shop link is {SITE_HOST}/{settings.slug}. It can&apos;t change, so links you&apos;ve
          already shared keep working.
        </p>
        <ShopForm businessName={settings.businessName} phone={settings.phone} />
      </section>

      <section aria-labelledby="paid-heading" className={sectionClass}>
        <h2 id="paid-heading" className="mb-1 font-semibold">
          Getting paid
        </h2>
        <FormNotice message={bankNotice} />
        {settings.payoutAccount === null && (
          <p className="text-sm text-zinc-600">
            No bank account yet, so you can&apos;t send payment links.{" "}
            <Link href="/signup/get-paid" className="text-brand-hover font-bold underline">
              Add bank account
            </Link>
          </p>
        )}
        {settings.payoutAccount && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Payments go to <strong>{settings.payoutAccount.bankAccountName}</strong>,{" "}
              {settings.payoutAccount.bankName}, account ending{" "}
              {settings.payoutAccount.accountLast4}.
            </p>
            {/* <details>: a built-in show/hide, so the form stays out of the way until needed. */}
            <details className="rounded-lg border border-zinc-200 p-4">
              <summary className="text-brand-hover min-h-11 cursor-pointer content-center font-bold">
                Change bank account
              </summary>
              <p className="my-3 text-sm text-zinc-500">
                Payments you&apos;ve already received aren&apos;t affected. New ones go to the new
                account.
              </p>
              {banks === null && (
                <FormError message="We couldn't load the list of banks. Please try again in a minute." />
              )}
              {banks !== null && <BankForm banks={banks} mode="change" />}
            </details>
          </div>
        )}
      </section>

      <section aria-labelledby="emails-heading" className={sectionClass}>
        <h2 id="emails-heading" className="mb-1 font-semibold">
          Emails
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          We always email you about payments, password and bank account changes. New-order emails
          are up to you.
        </p>
        <EmailsForm newOrderEmails={settings.newOrderEmails} />
      </section>

      <section aria-labelledby="security-heading" className={sectionClass}>
        <h2 id="security-heading" className="mb-4 font-semibold">
          Password
        </h2>
        <PasswordForm />
      </section>

      <section aria-labelledby="delete-heading" className={`${sectionClass} border-rose-200`}>
        <h2 id="delete-heading" className="mb-1 font-semibold">
          Delete my account
        </h2>
        <p className="mb-4 text-sm text-zinc-600">
          Your shop disappears straight away and you&apos;re signed out everywhere. We keep order
          records only as long as the law requires (see our{" "}
          <Link href="/legal/privacy" className="underline">
            privacy policy
          </Link>
          ). This can&apos;t be undone from here.
        </p>
        <CloseAccountForm businessName={settings.businessName} />
      </section>
    </main>
  );
}
