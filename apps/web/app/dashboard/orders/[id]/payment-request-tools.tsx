"use client";

import { useState, useTransition } from "react";
import { FormError, FormNotice } from "@/components/brand/form-bits";
import { resendPaymentAction } from "../../actions";
import { CopyLinkButton } from "../../copy-link-button";

/**
 * For an order waiting for payment, when the customer lost the WhatsApp message (deleted the
 * chat...): send the payment request again, or copy the pay link to paste anywhere.
 */
export function PaymentRequestTools({ orderId, payLink }: { orderId: string; payLink: string }) {
  // useTransition: React tracks the send as pending so the button can't be pressed twice.
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ notice?: string; error?: string }>({});

  function resend() {
    startTransition(async () => {
      setResult(await resendPaymentAction(orderId));
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-muted text-sm">Customer didn&apos;t get the payment request?</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={resend}
          disabled={pending}
          className="border-brand text-brand hover:bg-brand-tint focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full border-2 bg-white px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {pending && "Sending…"}
          {!pending && "Resend payment request"}
        </button>
        <CopyLinkButton url={payLink} label="Copy payment link" />
      </div>
      <FormNotice message={result.notice} />
      <FormError message={result.error} />
    </div>
  );
}
