"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/dashboard/bell-actions";
import type { BellData } from "@/lib/api";
import { formatWhen, typeMark } from "./notification-bits";

export type { BellData };

type Item = BellData["items"][number];

/**
 * The bell in the dashboard header: how many unread, and a list of Gbam's notifications.
 * Opening one marks it read and shows it on its own page (which has the Open button).
 */
export function NotificationBell({ data }: { data: BellData }) {
  const [open, setOpen] = useState(false);
  // useTransition: React keeps the list usable while the "read" save runs.
  const [, startTransition] = useTransition();
  const router = useRouter();

  let label = "Notifications";
  if (data.unread > 0) {
    label = `Notifications (${data.unread} unread)`;
  }

  function openItem(item: Item) {
    startTransition(async () => {
      if (item.readAt === null) {
        await markNotificationReadAction(item.id);
      }
      setOpen(false);
      router.push(`/dashboard/notifications/${item.id}`);
    });
  }

  function readAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-ink focus-visible:outline-brand hover:bg-brand-tint relative flex size-11 items-center justify-center rounded-full border-2 border-brand-tint focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {/* A simple bell drawn in SVG; the label above is what screen readers hear. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {data.unread > 0 && (
          <span
            aria-hidden="true"
            className="bg-coral-deep absolute -top-1 -right-1 min-w-5 rounded-full px-1 text-center text-xs font-bold text-white"
          >
            {data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border-2 border-brand-tint bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-ink text-sm font-bold">Notifications</h2>
            {data.unread > 0 && (
              <button
                type="button"
                onClick={readAll}
                className="text-brand-hover text-sm font-bold"
              >
                Mark all read
              </button>
            )}
          </div>
          {data.items.length === 0 && <p className="text-ink-muted p-2 text-sm">Nothing new.</p>}
          <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
            {data.items.map((item) => {
              let classes = "w-full rounded-xl p-3 text-left hover:bg-blush";
              if (item.readAt === null) {
                classes = "bg-brand-tint w-full rounded-xl p-3 text-left";
              }
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => openItem(item)} className={classes}>
                    <span className="text-ink flex gap-2 text-sm font-bold">
                      <span aria-hidden="true" className="text-ink-muted w-3 shrink-0">
                        {typeMark(item.type)}
                      </span>
                      {item.title}
                    </span>
                    <span className="text-ink-muted mt-1 block pl-5 text-sm">{item.body}</span>
                    <span className="text-ink-subtle mt-1 block pl-5 text-xs">
                      {formatWhen(item.createdAt)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="text-brand-hover mt-2 block rounded-xl p-2 text-center text-sm font-bold"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  );
}
