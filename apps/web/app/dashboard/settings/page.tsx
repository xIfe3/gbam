import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { BankForm } from "@/app/(auth)/signup/get-paid/bank-form";
import { FormError, FormNotice } from "@/components/brand/form-bits";
import { api, ApiError, type Bank } from "@/lib/api";
import { SITE_HOST } from "@/lib/site";
import { DeliveryForm } from "./delivery-form";
import { OrdersForm } from "./orders-form";
import { CloseAccountForm, EmailsForm, PasswordForm, ShopForm } from "./settings-forms";
import { ShopLinkForm } from "./shop-link-form";
import { ShopImagesForm } from "@/components/dashboard/shop-images-form";

export const metadata: Metadata = {
  title: "Settings",
  description: "Your shop details, payout bank account, delivery, emails, password and account.",
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
  const delivery = await api.getDeliverySettings();
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
        <p className="mb-4 text-sm text-zinc-500">Your shop name and WhatsApp number.</p>
        <ShopForm businessName={settings.businessName} phone={settings.phone} />
      </section>

      <section id="look" aria-labelledby="look-heading" className={sectionClass}>
        <h2 id="look-heading" className="mb-1 font-semibold">
          Logo and banner
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Shown at the top of your shop page, LinkedIn style. Your logo also shows in your
          dashboard.
        </p>
        <ShopImagesForm
          businessName={settings.businessName}
          logoUrl={settings.logoUrl}
          bannerUrl={settings.bannerUrl}
        />
      </section>

      <section aria-labelledby="link-heading" className={sectionClass}>
        <h2 id="link-heading" className="mb-1 font-semibold">
          Shop link
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Customers visit {SITE_HOST}/{settings.slug}. Changed your shop name? You can change the
          link to match.
        </p>
        <ShopLinkForm slug={settings.slug} nextChangeAt={settings.nextSlugChangeAt} />
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

      <section id="delivery" aria-labelledby="delivery-heading" className={sectionClass}>
        <h2 id="delivery-heading" className="mb-1 font-semibold">
          Delivery
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Add the areas you deliver to, with a price each. Customers pick one at checkout and pay
          for delivery with their order. Changing a price never changes orders already placed.
        </p>
        <DeliveryForm zones={delivery.zones} pickupNote={delivery.pickupNote} />
      </section>

      <section aria-labelledby="orders-heading" className={sectionClass}>
        <h2 id="orders-heading" className="mb-1 font-semibold">
          Orders
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          Customers can pay the moment they order. If you make things to order and need to check
          each order first, tick the box: orders then wait until you tap Request payment.
        </p>
        <OrdersForm approveOrdersFirst={settings.approveOrdersFirst} />
      </section>

      <section aria-labelledby="emails-heading" className={sectionClass}>
        <h2 id="emails-heading" className="mb-1 font-semibold">
          Emails
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          We always email you about payments, password and bank account changes. New-order emails
          are up to you.
        </p>
        <EmailsForm newOrderEmails={settings.newOrderEmails} newsEmails={settings.newsEmails} />
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
