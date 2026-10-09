"use client";

import { useEffect } from "react";

type BeatKind = "storefront" | "product" | "checkout" | "dashboard" | "admin";

const EVERY_MS = 60_000;
const TAB_KEY = "gbam-tab";

/**
 * A random id for this browser tab, kept in sessionStorage (it disappears when the tab
 * closes, and it's never a cookie). It only stops one tab being counted twice.
 */
function tabId(): string {
  try {
    const saved = sessionStorage.getItem(TAB_KEY);
    if (saved) {
      return saved;
    }
    const made = crypto.randomUUID().replaceAll("-", "");
    sessionStorage.setItem(TAB_KEY, made);
    return made;
  } catch {
    // Storage blocked (private mode, some in-app browsers): a fresh id for this page.
    return crypto.randomUUID().replaceAll("-", "");
  }
}

async function send(kind: BeatKind, shop: string | undefined, first: boolean): Promise<void> {
  try {
    await fetch("/api/beat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tabId: tabId(), kind, shop, first }),
      // keepalive: the beat still goes if the visitor leaves the page right away.
      keepalive: true,
    });
  } catch {
    // A beat that fails just isn't counted; the page carries on.
  }
}

/**
 * Tells Gbam "someone is on this page": once when it opens, then once a minute while the tab
 * is in view. Only counts are kept (see the API's VisitsService). Renders nothing.
 */
export function Beacon({ kind, shop }: { kind: BeatKind; shop?: string }) {
  useEffect(() => {
    void send(kind, shop, true);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void send(kind, shop, false);
      }
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [kind, shop]);

  return null;
}
