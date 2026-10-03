// "use client" = this component runs in the BROWSER (it needs the pending state).
"use client";

import { useActionState } from "react";
import { TextField } from "@/components/brand/fields";
import { sendContactMessage, type ContactState } from "./actions";

const textareaClasses =
  "min-h-32 w-full rounded-xl border-2 border-brand-tint bg-white px-4 py-3 text-base text-ink placeholder:text-ink-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand aria-[invalid=true]:border-coral-deep";

/** The contact form. The server action keeps what was typed when something goes wrong. */
export function ContactForm() {
  const [state, formAction, pending] = useActionState<ContactState, FormData>(
    sendContactMessage,
    { status: "idle" },
  );

  if (state.status === "success") {
    return (
      <div role="status" className="bg-brand-tint text-ink rounded-3xl p-6">
        <h2 className="font-display text-2xl font-black">Message sent</h2>
        <p className="text-ink-muted mt-2">
          Thanks for writing. We will reply to the email address you gave us.
        </p>
      </div>
    );
  }

  function fieldError(fieldName: string): string | undefined {
    if (state.status !== "error" || !state.fieldErrors) {
      return undefined;
    }
    const errors = state.fieldErrors[fieldName];
    if (!errors) {
      return undefined;
    }
    return errors[0];
  }

  let previous: { name: string; email: string; phone: string; message: string } | undefined =
    undefined;
  if (state.status === "error") {
    previous = state.values;
  }
  const messageError = fieldError("message");

  let submitLabel = "Send message";
  if (pending) {
    submitLabel = "Sending…";
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset disabled={pending} className="flex flex-col gap-4">
        <TextField
          label="Your name"
          name="name"
          autoComplete="name"
          required
          maxLength={120}
          defaultValue={previous?.name}
          error={fieldError("name")}
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={previous?.email}
          error={fieldError("email")}
        />
        <TextField
          label="Phone (optional)"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0803 123 4567"
          defaultValue={previous?.phone}
          error={fieldError("phone")}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-message" className="text-ink text-sm font-bold">
            Message
          </label>
          <textarea
            id="contact-message"
            name="message"
            required
            minLength={10}
            maxLength={3000}
            defaultValue={previous?.message}
            aria-invalid={messageError ? true : undefined}
            aria-describedby={messageError ? "contact-message-error" : undefined}
            className={textareaClasses}
          />
          {messageError && (
            <p
              id="contact-message-error"
              role="alert"
              className="text-ink text-sm font-medium"
            >
              {messageError}
            </p>
          )}
        </div>
      </fieldset>

      {state.status === "error" && (
        <p role="alert" className="bg-coral-wash text-ink border-coral-deep rounded-xl border-l-4 px-4 py-3 text-sm">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-brand hover:bg-brand-hover focus-visible:outline-brand inline-flex min-h-12 items-center justify-center rounded-full px-7 text-base font-bold text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      >
        {submitLabel}
      </button>
    </form>
  );
}
