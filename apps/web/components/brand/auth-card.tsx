import Link from "next/link";
import { Logo } from "./logo";
import { PaymentToast } from "./payment-toast";

type AuthCardProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  // A line under the card, e.g. "New here? Create your shop".
  footer?: React.ReactNode;
};

// The centered white card used by log in, forgot password and reset password.
export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="w-full max-w-md">
      <div className="relative rounded-[22px] bg-white p-6 shadow-[0_14px_40px_rgba(19,42,32,0.12)] sm:p-8">
        {/* Decorative example card (approved layout B). Hidden on phones, where it would
            overflow a 360px screen; sample numbers, not a real payment. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-5 -right-6 hidden rotate-3 sm:block lg:-right-14"
        >
          <PaymentToast amountKobo={600000} code="GB-4821" />
        </div>
        <div className="flex justify-center">
          <Link
            href="/"
            className="focus-visible:outline-brand rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <Logo size="md" />
          </Link>
        </div>
        <h1 className="font-display text-ink mt-5 text-center text-2xl font-black">{title}</h1>
        {subtitle && <p className="text-ink-muted mt-2 text-center text-sm">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="text-ink-muted mt-5 text-center text-sm">{footer}</p>}
    </div>
  );
}

/** A text link styled for small text on white/blush (brand-hover keeps contrast above 4.5:1). */
export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-brand-hover focus-visible:outline-brand inline-flex min-h-11 items-center rounded font-bold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {children}
    </Link>
  );
}
