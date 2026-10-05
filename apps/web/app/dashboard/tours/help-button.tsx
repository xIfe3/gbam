"use client";

import Link from "next/link";
import { useTours } from "./tours-provider";

const ROUND =
  "border-brand-tint text-ink hover:bg-brand-tint focus-visible:outline-brand flex size-11 items-center justify-center rounded-full border-2 text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2";

/**
 * The "?" in the dashboard header. On a page with a tour it replays that tour (without
 * changing the saved "done" record); on any other page it opens the help centre.
 */
export function HelpButton() {
  const tours = useTours();
  if (tours && tours.hasTour) {
    return (
      <button
        type="button"
        onClick={() => tours.replayCurrent()}
        aria-label="Show me around this page"
        title="Show me around this page"
        className={ROUND}
      >
        ?
      </button>
    );
  }
  return (
    <Link href="/help" aria-label="Help centre" title="Help centre" className={ROUND}>
      ?
    </Link>
  );
}
