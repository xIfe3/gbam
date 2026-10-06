"use client";

import { useState } from "react";

type CopyState = "idle" | "copied" | "failed";

// How long the button says "✓ Copied" before going back to its label.
const COPIED_MS = 2000;

/**
 * Puts a link on the clipboard so the seller can paste it in WhatsApp. The button itself
 * says "✓ Copied" for a moment (nothing else on the page moves). Only if copying is blocked
 * does a note appear, on its own line underneath.
 */
export function CopyLinkButton({ url, label = "Copy link" }: { url: string; label?: string }) {
  // useState: remembers how the last tap went.
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      // The Clipboard API can be blocked (old browsers, some in-app browsers), so failure is
      // expected sometimes; we tell the seller how to copy by hand instead.
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), COPIED_MS);
    } catch {
      setState("failed");
    }
  }

  let buttonText = label;
  if (state === "copied") {
    buttonText = "✓ Copied";
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="border-brand text-brand hover:bg-brand-tint focus-visible:outline-brand inline-flex min-h-11 min-w-32 items-center justify-center rounded-full border-2 bg-white px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {buttonText}
      </button>
      {/* aria-live: screen readers read this out; sighted people already see the button change. */}
      <span aria-live="polite" className="sr-only">
        {state === "copied" && "Copied! Paste it in WhatsApp."}
      </span>
      {state === "failed" && (
        // basis-full puts it on its own line when the parent wraps (flex-wrap).
        <p role="alert" className="text-ink-muted basis-full text-sm">
          Couldn&apos;t copy. Press and hold the link to copy it.
        </p>
      )}
    </>
  );
}
