"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { acknowledgeNoticeAction, hideBannerAction } from "@/app/dashboard/bell-actions";
import type { Notice } from "@/lib/api";
import { typeMark } from "./notification-bits";

/** How far (in pixels) a finger has to move for a swipe to count as "Hide". */
const SWIPE_DISTANCE = 60;

/**
 * Gbam's banners at the top of the dashboard. "Hide" (the X, or swiping it away on a phone)
 * brings it back the next day; "Got it" hides it for good.
 */
export function NoticeBanners({ banners }: { banners: Notice[] }) {
  // Banners tapped away on this page. They disappear straight away, without waiting for
  // the server; the page refresh after the save keeps them gone.
  const [goneIds, setGoneIds] = useState<string[]>([]);
  // useTransition: the saves run without freezing the page.
  const [, startTransition] = useTransition();

  function remove(id: string, kind: "hide" | "acknowledge") {
    setGoneIds([...goneIds, id]);
    startTransition(async () => {
      if (kind === "hide") {
        await hideBannerAction(id);
      } else {
        await acknowledgeNoticeAction(id);
      }
    });
  }

  const shown: Notice[] = [];
  for (const banner of banners) {
    if (!goneIds.includes(banner.id)) {
      shown.push(banner);
    }
  }
  if (shown.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 flex flex-col gap-3">
      {shown.map((banner) => (
        <NoticeBanner
          key={banner.id}
          banner={banner}
          onHide={() => remove(banner.id, "hide")}
          onAcknowledge={() => remove(banner.id, "acknowledge")}
        />
      ))}
    </div>
  );
}

function NoticeBanner({
  banner,
  onHide,
  onAcknowledge,
}: {
  banner: Notice;
  onHide: () => void;
  onAcknowledge: () => void;
}) {
  // Where the finger first touched, to tell a swipe from a tap or a scroll.
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    if (touch) {
      touchStart.current = { x: touch.clientX, y: touch.clientY };
    }
  }

  // A swipe sideways or up counts as "Hide". Down is left alone: that's scrolling the page.
  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) {
      return;
    }
    const sideways = Math.abs(touch.clientX - start.x);
    const upwards = start.y - touch.clientY;
    if (sideways > SWIPE_DISTANCE || upwards > SWIPE_DISTANCE) {
      onHide();
    }
  }

  return (
    <aside
      aria-labelledby={`banner-${banner.id}-title`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="border-brand-tint bg-brand-tint/40 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2">
        <span
          aria-hidden="true"
          className="text-ink inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold"
        >
          {typeMark(banner.type)}
        </span>
        <div className="min-w-0">
          <p id={`banner-${banner.id}-title`} className="text-ink text-sm font-bold">
            {banner.title}
          </p>
          <p className="text-ink text-sm whitespace-pre-line">{banner.body}</p>
          {banner.link && (
            <Link href={banner.link} className="text-ink mt-1 inline-block text-sm font-bold underline">
              Open
            </Link>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onAcknowledge}
          className="bg-brand hover:bg-brand-hover inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-bold text-white"
        >
          <Check size={16} aria-hidden="true" />
          Got it
        </button>
        <button
          type="button"
          onClick={onHide}
          aria-label={`Hide "${banner.title}" until tomorrow`}
          className="text-ink hover:bg-brand-tint inline-flex size-11 items-center justify-center rounded-full"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
