"use client";

import { useEffect, useRef } from "react";
import type { TourStep } from "./tour-steps";

type TourCardProps = {
  steps: TourStep[];
  step: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onDone: () => void;
};

const SECONDARY =
  "text-brand focus-visible:outline-brand min-h-11 rounded-full px-3 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * The bottom card that explains one step. It doesn't cover the page, so the seller can
 * still tap what it points at. The element it talks about gets `data-tour-active`, which
 * globals.css draws as a green glow.
 */
export function TourCard({ steps, step, onNext, onBack, onSkip, onDone }: TourCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const current = steps[step - 1];
  const isLast = step === steps.length;

  // Glow the element this step talks about and bring it into view. The element may not be on
  // the page yet (e.g. the next step of the add-product form), so we also watch the page with a
  // MutationObserver (the browser tells us when elements are added) and glow it when it appears.
  useEffect(() => {
    if (!current) {
      return;
    }
    const selector = `[data-tour="${current.target}"]`;
    let glowing: Element | null = null;

    function glow() {
      const target = document.querySelector(selector);
      if (target === null || target === glowing) {
        return;
      }
      if (glowing) {
        glowing.removeAttribute("data-tour-active");
      }
      glowing = target;
      target.setAttribute("data-tour-active", "");
      if (typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }

    glow();
    const observer = new MutationObserver(glow);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (glowing) {
        glowing.removeAttribute("data-tour-active");
      }
    };
  }, [current]);

  // While the card is open, add room at the bottom of the page so it never covers the
  // page's last button. (Padding on <body>, so it's always at the end, wherever the tour sits.)
  useEffect(() => {
    const before = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "20rem";
    return () => {
      document.body.style.paddingBottom = before;
    };
  }, []);

  // Move keyboard / screen-reader focus to the card each time the step changes.
  useEffect(() => {
    cardRef.current?.focus();
  }, [step]);

  // Esc skips the tour, like closing a dialog. Skipping is permanent, so only when the card
  // (or nothing in particular) has focus: an Esc typed in a form field or another dialog is not
  // meant for us.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      const active = document.activeElement;
      const card = cardRef.current;
      let insideCard = false;
      if (card && active && card.contains(active)) {
        insideCard = true;
      }
      const nothingFocused = active === null || active === document.body;
      if (insideCard || nothingFocused) {
        onSkip();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onSkip]);

  if (!current) {
    return null;
  }

  const dots = [];
  for (let i = 1; i <= steps.length; i++) {
    let dotClass = "bg-brand-tint";
    if (i === step) {
      dotClass = "bg-brand";
    }
    dots.push(<span key={i} className={`size-2 rounded-full ${dotClass}`} />);
  }

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      tabIndex={-1}
      className="border-brand-tint fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg rounded-t-2xl border-2 border-b-0 bg-white p-5 shadow-[0_-10px_30px_rgba(19,42,32,0.15)] focus-visible:outline-none"
    >
      <div className="flex items-center gap-2">
        <div aria-hidden="true" className="flex gap-1.5">
          {dots}
        </div>
        <span className="text-ink-muted text-xs">
          {step} of {steps.length}
        </span>
      </div>
      <h2 id="tour-title" className="font-display text-ink mt-2 text-lg font-black">
        {current.title}
      </h2>
      <p className="text-ink-muted mt-1">{current.body}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" onClick={onSkip} className={SECONDARY}>
          Skip tour
        </button>
        <div className="flex items-center gap-1">
          {step > 1 && (
            <button type="button" onClick={onBack} className={SECONDARY}>
              Back
            </button>
          )}
          {!isLast && (
            <button
              type="button"
              onClick={onNext}
              className="bg-brand hover:bg-brand-hover focus-visible:outline-brand min-h-11 rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Next
            </button>
          )}
          {isLast && (
            <button
              type="button"
              onClick={onDone}
              className="bg-brand hover:bg-brand-hover focus-visible:outline-brand min-h-11 rounded-full px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
