import type { Metadata } from "next";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";
import { PhoneMockup } from "@/components/brand/phone-mockup";

export const metadata: Metadata = {
  title: "How it works",
  description: "From your first shop link to a delivered order, step by step.",
};

// A tiny screen shown inside the phone. All of it is example data.
function Screen({ heading, lines }: { heading: string; lines: string[] }) {
  return (
    <>
      <div className="bg-brand px-3 pt-4 pb-2 text-[11px] font-bold text-white">{heading}</div>
      <div className="text-ink flex flex-col gap-1.5 p-2.5 text-[10px] leading-snug">
        {lines.map((line) => (
          <div key={line} className="rounded-lg bg-white px-2 py-1.5">
            {line}
          </div>
        ))}
      </div>
    </>
  );
}

type Step = { title: string; text: string; heading: string; lines: string[] };

const SELLER_STEPS: Step[] = [
  {
    title: "Set up your shop",
    text: "Create an account, name your shop, add your bank account and your products. You get a shop link of your own.",
    heading: "Your shop",
    lines: ["Jollof Rice  ₦3,500", "Chapman  ₦2,000", "gbam.app/your-shop"],
  },
  {
    title: "Share the link",
    text: "Post it on your WhatsApp status, your bio or in chats. One link replaces the back-and-forth.",
    heading: "WhatsApp status",
    lines: ["Order here: gbam.app/your-shop"],
  },
  {
    title: "Get paid orders",
    text: "When a customer pays, the order shows up in your dashboard as paid. Mark it as sent out or delivered as you go.",
    heading: "Orders",
    lines: ["GB-7K3Q  Paid", "GB-4M2P  Awaiting payment"],
  },
];

const CUSTOMER_STEPS: Step[] = [
  {
    title: "Open the shop link",
    text: "No app and no account. The customer opens your link in their browser and picks what they want.",
    heading: "Mama Ngozi Kitchen",
    lines: ["2 × Jollof Rice", "1 × Chapman"],
  },
  {
    title: "Pay with Paystack",
    text: "They enter their name and WhatsApp number, then pay through Paystack. Card details go to Paystack, not to us.",
    heading: "Pay ₦9,000",
    lines: ["Pay with Paystack"],
  },
  {
    title: "Hear back on WhatsApp",
    text: "A WhatsApp message confirms the order and payment, and another follows when it is sent out.",
    heading: "WhatsApp",
    lines: ["Payment received. Thank you!", "Your order is on its way."],
  },
];

function StepList({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-10">
      <h2 className="font-display text-ink text-3xl font-black">{title}</h2>
      <ol className="mt-8 flex flex-col gap-6">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col items-center gap-6 rounded-3xl bg-white p-6 sm:flex-row"
          >
            <div className="flex-1">
              <span
                aria-hidden="true"
                className="font-display bg-coral-tint text-coral-deep flex h-10 w-10 items-center justify-center rounded-full text-xl font-black"
              >
                {index + 1}
              </span>
              <h3 className="font-display text-ink mt-4 text-2xl font-black">{step.title}</h3>
              <p className="text-ink-muted mt-2 max-w-md">{step.text}</p>
            </div>
            <PhoneMockup>
              <Screen heading={step.heading} lines={step.lines} />
            </PhoneMockup>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <PageHeader
        eyebrow="How it works"
        title="From link to delivered order"
        lead="Here is what happens on your side and on your customer's side."
        photo={{ description: "customer paying on her phone" }}
      />
      <StepList title="For sellers" steps={SELLER_STEPS} />
      <StepList title="For your customers" steps={CUSTOMER_STEPS} />
      <CtaBand />
    </>
  );
}
