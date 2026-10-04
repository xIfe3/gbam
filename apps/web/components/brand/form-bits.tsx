"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";

// Submit button for forms driven by a server action: disables itself while sending so a
// double tap cannot submit twice.
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" size="lg" type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </Button>
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
      className="bg-coral-wash text-ink border-coral-deep rounded-xl border-l-4 px-4 py-3 text-sm font-medium"
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
    <p role="status" className="bg-brand-tint text-ink rounded-xl px-4 py-3 text-sm font-medium">
      {message}
    </p>
  );
}
