"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatWhen, typeMark } from "@/components/dashboard/notification-bits";
import type { NotificationBulkAction, NotificationTab, SellerNotification } from "@/lib/api";
import { bulkNotificationsAction } from "../bell-actions";

/** The buttons above the list, by tab: the trash only has Restore. */
function bulkButtonsFor(tab: NotificationTab): { action: NotificationBulkAction; label: string }[] {
  if (tab === "trash") {
    return [{ action: "restore", label: "Restore" }];
  }
  return [
    { action: "read", label: "Mark read" },
    { action: "unread", label: "Mark unread" },
    { action: "trash", label: "Move to trash" },
  ];
}

/** The notifications on one page of the list, with a tick box each for changing several. */
export function NotificationList({
  rows,
  tab,
}: {
  rows: SellerNotification[];
  tab: NotificationTab;
}) {
  // The ids of the ticked notifications.
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  // useTransition: the list stays usable while the change is saved.
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    if (selected.includes(id)) {
      const without: string[] = [];
      for (const each of selected) {
        if (each !== id) {
          without.push(each);
        }
      }
      setSelected(without);
    } else {
      setSelected([...selected, id]);
    }
  }

  const allTicked = rows.length > 0 && selected.length === rows.length;

  function toggleAll() {
    if (allTicked) {
      setSelected([]);
      return;
    }
    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
    }
    setSelected(ids);
  }

  function apply(action: NotificationBulkAction) {
    const ids = selected;
    startTransition(async () => {
      const result = await bulkNotificationsAction(ids, action);
      if (result.error) {
        setError(result.error);
        return;
      }
      setError("");
      setSelected([]);
    });
  }

  if (rows.length === 0) {
    return null;
  }

  let selectedText = "None selected";
  if (selected.length > 0) {
    selectedText = `${selected.length} selected`;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3">
        <label className="text-ink flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={allTicked}
            onChange={toggleAll}
            className="accent-brand size-5"
          />
          Select all
        </label>
        <span className="text-ink-muted text-sm">{selectedText}</span>
        <div className="flex flex-wrap gap-2">
          {bulkButtonsFor(tab).map((button) => (
            <button
              key={button.action}
              type="button"
              disabled={selected.length === 0 || pending}
              onClick={() => apply(button.action)}
              className="border-brand-tint text-ink rounded-full border-2 px-3 py-1 text-sm font-bold disabled:opacity-50"
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="bg-blush text-ink rounded-xl p-3 text-sm">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          let classes = "flex gap-3 rounded-xl bg-white p-3";
          if (row.readAt === null) {
            classes = "bg-brand-tint flex gap-3 rounded-xl p-3";
          }
          return (
            <li key={row.id} className={classes}>
              <input
                type="checkbox"
                aria-label={`Select "${row.title}"`}
                checked={selected.includes(row.id)}
                onChange={() => toggle(row.id)}
                className="accent-brand mt-1 size-5 shrink-0"
              />
              {/* prefetch off: opening a notification marks it read, so only a real tap should. */}
              <Link
                href={`/dashboard/notifications/${row.id}`}
                prefetch={false}
                className="min-w-0 flex-1"
              >
                <span className="text-ink flex gap-2 text-sm font-bold">
                  <span aria-hidden="true" className="text-ink-muted w-3 shrink-0">
                    {typeMark(row.type)}
                  </span>
                  {row.title}
                  {row.readAt === null && <span className="sr-only"> (unread)</span>}
                </span>
                <span className="text-ink-muted mt-1 block truncate pl-5 text-sm">{row.body}</span>
                <span className="text-ink-subtle mt-1 block pl-5 text-xs">
                  {formatWhen(row.createdAt)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
