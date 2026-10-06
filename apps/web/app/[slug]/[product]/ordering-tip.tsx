"use client";

import { useState, useSyncExternalStore } from "react";

// Customers have no account, so "already seen" can only live in this browser. One key for
// every gbam shop: once someone has learned how to order, they don't need the tip again.
const STORAGE_KEY = "gbam-tip-ordering";

function hasSeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "seen";
  } catch {
    // Storage blocked (private mode, strict settings): we can't remember, so show it.
    return false;
  }
}

function rememberSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "seen");
  } catch {
    // Can't remember it in this browser; it just hides for this visit.
  }
}

// Nothing to listen to: the flag only changes when this component sets it.
function subscribe() {
  return () => {};
}

/** On the server we can't read localStorage, so we say "seen" there: no tip, no flash. */
function seenOnServer() {
  return true;
}

/** One small "how to order" card on product pages, until the customer taps Got it. */
export function OrderingTip() {
  // useSyncExternalStore reads a value from outside React (here: localStorage) safely during
  // hydration: the server answer is used first, then the browser's real answer.
  const seen = useSyncExternalStore(subscribe, hasSeen, seenOnServer);
  const [dismissed, setDismissed] = useState(false);

  if (seen || dismissed) {
    return null;
  }

  function dismiss() {
    rememberSeen();
    setDismissed(true);
  }

  return (
    <aside
      aria-label="How to order"
      className="bg-brand-tint/60 mb-4 flex items-center gap-2 rounded-xl px-3 py-1.5"
    >
      <span aria-hidden="true">💡</span>
      <p className="text-ink flex-1 text-sm">
        Pick your options → Add to order → Place order. You&apos;ll get updates on WhatsApp.
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="text-brand focus-visible:outline-brand min-h-11 shrink-0 rounded-full px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Got it
      </button>
    </aside>
  );
}
