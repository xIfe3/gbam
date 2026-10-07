"use client";

/**
 * Paystack's official pop-up ("InlineJS"). It opens Paystack's own secure window over our
 * page, so card details only ever go to Paystack. We load their script only when someone
 * actually presses Pay, not on every page.
 */
const SCRIPT_URL = "https://js.paystack.co/v2/inline.js";

/** The small part of Paystack's pop-up we use. */
type PaystackPopup = {
  resumeTransaction(
    accessCode: string,
    callbacks: { onSuccess?: () => void; onCancel?: () => void; onError?: () => void },
  ): void;
};

declare global {
  interface Window {
    PaystackPop?: new () => PaystackPopup;
  }
}

let loading: Promise<void> | null = null;

/** Adds Paystack's script to the page once; later calls reuse the same download. */
function loadScript(): Promise<void> {
  if (window.PaystackPop) {
    return Promise.resolve();
  }
  if (loading) {
    return loading;
  }
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later press try again (e.g. after the connection comes back).
      loading = null;
      script.remove();
      reject(new Error("Paystack's pop-up didn't load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export type PopupOutcome = "paid" | "closed";

/**
 * Opens Paystack's pop-up for a checkout we already created. Resolves "paid" when Paystack
 * says the payment went through (our webhook still confirms it before the order is marked
 * paid), "closed" when the customer closes it. Rejects if the pop-up can't open at all.
 */
export async function openPaystackPopup(accessCode: string): Promise<PopupOutcome> {
  await loadScript();
  const Popup = window.PaystackPop;
  if (!Popup) {
    throw new Error("Paystack's pop-up didn't load");
  }
  return new Promise<PopupOutcome>((resolve, reject) => {
    const popup = new Popup();
    popup.resumeTransaction(accessCode, {
      onSuccess: () => resolve("paid"),
      onCancel: () => resolve("closed"),
      onError: () => reject(new Error("Paystack's pop-up failed")),
    });
  });
}
