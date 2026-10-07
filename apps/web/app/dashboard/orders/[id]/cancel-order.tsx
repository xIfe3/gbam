"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FormError } from "@/components/brand/form-bits";
import { updateOrderStatus } from "../../actions";

// How long the seller has to change their mind after confirming.
const UNDO_SECONDS = 5;

type Step = "idle" | "counting" | "sending";

/**
 * "Cancel this order", kept away from the everyday buttons so it is never pressed by accident.
 * Confirm box first, then a short countdown with Undo. The server is only told when the
 * countdown ends, so Undo (or leaving the page) means nothing was ever cancelled.
 */
export function CancelOrder({ orderId, code }: { orderId: string; code: string }) {
  const [step, setStep] = useState<Step>("idle");
  const [secondsLeft, setSecondsLeft] = useState(UNDO_SECONDS);
  const [error, setError] = useState<string | undefined>(undefined);
  // useTransition: lets the server call run without freezing the page.
  const [, startTransition] = useTransition();
  // useRef: a handle on the <dialog> element so we can open and close it.
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Where keyboard focus goes: Undo while counting, back to the trigger after Undo.
  const undoRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // What screen readers hear. Said once at the start and once at the end, not every second.
  const [announcement, setAnnouncement] = useState("");

  // The countdown: one tick per second while counting. The cleanup (the function returned)
  // stops the timer when Undo is pressed or the seller leaves the page, so nothing is sent.
  useEffect(() => {
    if (step !== "counting") {
      return;
    }
    const timer = setTimeout(() => {
      if (secondsLeft > 1) {
        setSecondsLeft(secondsLeft - 1);
        return;
      }
      // Time's up: now actually cancel.
      setStep("sending");
      setAnnouncement(`Cancelling ${code}…`);
      startTransition(async () => {
        const formData = new FormData();
        formData.set("orderId", orderId);
        formData.set("status", "cancelled");
        const result = await updateOrderStatus({}, formData);
        if (result.error) {
          setError(result.error);
          setStep("idle");
        }
        // On success the page refreshes and shows the order as cancelled.
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, secondsLeft, orderId, code]);

  function openConfirm() {
    setError(undefined);
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.showModal();
    }
  }

  function closeConfirm() {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.close();
    }
  }

  function confirmCancel() {
    closeConfirm();
    setSecondsLeft(UNDO_SECONDS);
    setStep("counting");
    setAnnouncement(`Cancelling ${code} in ${UNDO_SECONDS} seconds. Press Undo to keep it.`);
  }

  function undo() {
    setStep("idle");
    setAnnouncement(`Not cancelled. ${code} is unchanged.`);
  }

  // After the screen changes, put focus where the person needs it next: on Undo while the
  // countdown runs (the button they pressed is gone), back on "Cancel order…" after Undo.
  useEffect(() => {
    if (step === "counting" && undoRef.current) {
      undoRef.current.focus();
    }
    if (step === "idle" && announcement !== "" && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [step, announcement]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">Cancel this order</h3>
        <p className="text-sm text-zinc-500">
          The customer gets a WhatsApp message saying it&apos;s cancelled.
        </p>
      </div>

      {step === "idle" && (
        <button
          ref={triggerRef}
          type="button"
          onClick={openConfirm}
          className="min-h-11 rounded-lg border border-rose-300 px-4 py-2 font-medium text-rose-700 hover:bg-rose-50"
        >
          Cancel order…
        </button>
      )}

      {step === "counting" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-zinc-900 px-4 py-3 text-white">
          {/* aria-hidden: the ticking number would be read out every second; the live
              region below says it once instead. */}
          <span aria-hidden="true">
            Cancelling {code} in {secondsLeft}…
          </span>
          <button
            ref={undoRef}
            type="button"
            onClick={undo}
            className="min-h-11 rounded-lg bg-white px-4 font-bold text-zinc-900 hover:bg-zinc-100"
          >
            Undo
          </button>
        </div>
      )}

      {step === "sending" && <p className="text-sm text-zinc-500">Cancelling…</p>}

      {/* Always on the page, so screen readers notice when its text changes. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <FormError message={error} />

      {/* <dialog> + showModal(): the browser's own pop-up box. It traps focus and closes on Esc. */}
      <dialog
        ref={dialogRef}
        aria-labelledby="cancel-title"
        className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-xl bg-white p-5 shadow-xl backdrop:bg-black/40"
      >
        <h2 id="cancel-title" className="text-lg font-bold">
          Cancel {code}?
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          The customer will get a WhatsApp message that their order is cancelled. You&apos;ll
          have {UNDO_SECONDS} seconds to undo.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={closeConfirm}
            className="bg-brand hover:bg-brand-hover min-h-11 rounded-lg px-4 font-medium text-white"
          >
            Keep order
          </button>
          <button
            type="button"
            onClick={confirmCancel}
            className="min-h-11 rounded-lg border border-rose-300 px-4 font-medium text-rose-700 hover:bg-rose-50"
          >
            Yes, cancel it
          </button>
        </div>
      </dialog>
    </div>
  );
}
