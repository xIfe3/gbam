import type { Metadata } from "next";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Gbam team.",
};

const linkClasses =
  "text-brand focus-visible:outline-brand rounded font-bold underline focus-visible:outline-2 focus-visible:outline-offset-2";

// Server component: reads the WhatsApp number from the environment at request time.
// Digits only, international format (e.g. 2348031234567). No link is shown until it is set,
// so we never publish a made-up number.
function whatsappHref(): string | undefined {
  const digits = (process.env.GBAM_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  if (digits === "") {
    return undefined;
  }
  return `https://wa.me/${digits}`;
}

export default function ContactPage() {
  const whatsapp = whatsappHref();

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 md:grid-cols-2">
      <div>
        <p className="text-coral-deep mb-3 text-xs font-bold tracking-widest uppercase">Contact</p>
        <h1 className="font-display text-ink text-4xl leading-none font-black sm:text-5xl">
          Talk to us
        </h1>
        <p className="text-ink-muted mt-4 max-w-md text-lg leading-relaxed">
          Questions, feedback or something not working? Send a message and a person will reply.
        </p>

        <ul className="text-ink mt-8 flex flex-col gap-4">
          <li>
            <p className="text-sm font-bold">General</p>
            <a href="mailto:hello@gbam.app" className={linkClasses}>
              hello@gbam.app
            </a>
          </li>
          <li>
            <p className="text-sm font-bold">Help with your account or an order</p>
            <a href="mailto:support@gbam.app" className={linkClasses}>
              support@gbam.app
            </a>
          </li>
          <li>
            <p className="text-sm font-bold">Privacy questions</p>
            <a href="mailto:privacy@gbam.app" className={linkClasses}>
              privacy@gbam.app
            </a>
          </li>
          {whatsapp && (
            <li>
              <p className="text-sm font-bold">WhatsApp</p>
              <a href={whatsapp} className={linkClasses} rel="noopener noreferrer">
                Chat with us on WhatsApp
              </a>
            </li>
          )}
        </ul>
      </div>

      <ContactForm />
    </div>
  );
}
