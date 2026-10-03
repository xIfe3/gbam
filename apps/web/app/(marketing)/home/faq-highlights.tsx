import { formatNaira, PLATFORM_FEE } from "@gbam/shared";
import Link from "next/link";

const FAQS = [
  {
    question: "Do my customers need to install an app?",
    answer: "No. They open your shop link in their browser, order, and pay with Paystack.",
  },
  {
    question: "How do I get paid?",
    answer: "Payments are made with Paystack and paid out to the bank account you add during setup.",
  },
  {
    question: "What does Gbam cost?",
    answer: `${PLATFORM_FEE.percentBasisPoints / 100}% per paid order, never more than ${formatNaira(PLATFORM_FEE.capKobo)}. It is free for founding sellers.`,
  },
  {
    question: "Will my customers hear from me on WhatsApp?",
    answer: "Yes. Gbam sends order and payment updates on WhatsApp automatically.",
  },
];

export function FaqHighlights() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <h2 className="font-display text-ink mb-8 text-center text-3xl font-black sm:text-4xl">
        Quick answers
      </h2>
      <div className="flex flex-col gap-3">
        {FAQS.map((faq) => (
          <details key={faq.question} className="rounded-2xl bg-white p-5">
            <summary className="text-ink focus-visible:outline-brand min-h-11 cursor-pointer text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2">
              {faq.question}
            </summary>
            <p className="text-ink-muted mt-2">{faq.answer}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 text-center">
        <Link
          href="/faq"
          className="text-brand focus-visible:outline-brand inline-flex min-h-11 items-center font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Read all questions
        </Link>
      </p>
    </section>
  );
}
