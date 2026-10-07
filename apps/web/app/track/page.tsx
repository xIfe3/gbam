import type { Metadata } from "next";
import { Footer } from "@/components/brand/footer";
import { Header } from "@/components/brand/header";
import { LookupForm } from "./lookup-form";
import { MyOrdersList } from "./my-orders-list";

export const metadata: Metadata = {
  title: "Track an order",
  description: "Find your order with its code and the last 4 digits of your phone number.",
};

/** /track: orders remembered on this phone, and a form for everyone else. */
export default function TrackPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-12">
        <div>
          <h1 className="font-display text-ink text-4xl font-black">Track an order</h1>
          <p className="text-ink-muted mt-2">
            See where your order is, pay for it, or get help, with no account needed.
          </p>
        </div>
        <MyOrdersList />
        <LookupForm />
      </main>
      <Footer />
    </>
  );
}
