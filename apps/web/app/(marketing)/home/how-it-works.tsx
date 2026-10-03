const STEPS = [
  {
    title: "Share your link",
    text: "Set up your shop once and post one link on your WhatsApp status, bio or chats.",
  },
  {
    title: "Customers order and pay",
    text: "They pick items and pay with Paystack. You see the order the moment it is paid.",
  },
  {
    title: "Pack, deliver, done",
    text: "Mark the order as out for delivery and your customer gets a WhatsApp update.",
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16">
      <h2 className="font-display text-ink text-center text-3xl font-black sm:text-4xl">
        How it works
      </h2>
      <ol className="mt-10 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="rounded-3xl bg-white p-6">
            <span
              aria-hidden="true"
              className="font-display bg-coral-tint text-coral-deep flex h-10 w-10 items-center justify-center rounded-full text-xl font-black"
            >
              {index + 1}
            </span>
            <h3 className="font-display text-ink mt-4 text-xl font-black">{step.title}</h3>
            <p className="text-ink-muted mt-2">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
