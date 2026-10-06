"use client";

import { useState } from "react";

type CopyState = "idle" | "copied" | "failed";

/** "Copy shop link": puts the seller's shop URL on the clipboard so they can paste it in WhatsApp. */
export function CopyLinkButton({ url, label = "Copy shop link" }: { url: string; label?: string }) {
  // useState: remembers whether the last tap worked, so we can say so under the button.
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      // The Clipboard API can be blocked (old browsers, some in-app browsers), so failure is
      // expected sometimes; we tell the seller how to copy by hand instead.
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  let message = "";
  if (state === "copied") {
    message = "Copied! Paste it in WhatsApp.";
  } else if (state === "failed") {
    message = "Couldn't copy. Press and hold the link above to copy it.";
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="bg-brand hover:bg-brand-hover focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {label}
      </button>
      {/* aria-live: screen readers read the message out when it appears. */}
      <p aria-live="polite" className="text-ink-muted min-h-5 text-sm">
        {message}
      </p>
    </>
  );
}
