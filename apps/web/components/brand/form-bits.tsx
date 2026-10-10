"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";

// Submit button for forms driven by a server action: disables itself while sending so a
// double tap cannot submit twice.
export function SubmitButton({
  children,
  pendingLabel,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  /** Off for another reason than sending (e.g. "not allowed yet"). */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" size="lg" type="submit" disabled={pending || disabled}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

// The same idea for buttons that keep their own look (e.g. "Log out" in a header): while the
// form is sending, show `pendingLabel` and disable the button so it can't be tapped twice.
export function PendingButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
}) {
  // useFormStatus: React tells us whether the <form> around this button is still sending.
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}

// The form-level error ("wrong password", "try again in 15 minutes"). Ink text on a coral
// wash keeps contrast above 4.5:1 (coral-deep text on that wash would not).
export function FormError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="alert"
      className="bg-coral-wash text-ink border-coral-tint rounded-lg border px-4 py-3 text-sm font-medium"
    >
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  return (
    <p
      role="status"
      className="bg-brand-tint text-ink border-brand-tint rounded-lg border px-4 py-3 text-sm font-medium"
    >
      {message}
    </p>
  );
}
