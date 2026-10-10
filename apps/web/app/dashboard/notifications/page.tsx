import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { param } from "@/components/admin/list-params";
import { PendingButton } from "@/components/brand/form-bits";
import { api, type NotificationTab } from "@/lib/api";
import { emptyNotificationTrashAction, markAllNotificationsReadAction } from "../bell-actions";
import { ConfirmButton } from "./confirm-button";
import { NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Notifications" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function tabFrom(value: string): NotificationTab {
  if (value === "unread" || value === "trash") {
    return value;
  }
  return "all";
}

/** The type in the address, if it is one we know; anything else means "every type". */
function typeFrom(value: string): string {
  for (const type of NOTIFICATION_TYPES) {
    if (type === value) {
      return type;
    }
  }
  return "";
}

/** A link to this page with the same tab, type and search, on another page number. */
function pageLink(tab: NotificationTab, type: string, q: string, page: number): string {
  const params = new URLSearchParams();
  if (tab !== "all") {
    params.set("tab", tab);
  }
  if (type) {
    params.set("type", type);
  }
  if (q) {
    params.set("q", q);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  if (query === "") {
    return "/dashboard/notifications";
  }
  return `/dashboard/notifications?${query}`;
}

/** Every notification Gbam sent this shop: All, Unread and the Trash, with search. */
export default async function NotificationsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const tab = tabFrom(param(searchParams, "tab"));
  const type = typeFrom(param(searchParams, "type"));
  const q = param(searchParams, "q").trim();
  let page = Number(param(searchParams, "page"));
  if (!Number.isInteger(page) || page < 1) {
    page = 1;
  }

  const data = await api.notificationsPage({ tab, type, q, page });

  let unreadLabel = "Unread";
  if (data.unread > 0) {
    unreadLabel = `Unread (${data.unread})`;
  }
  const tabs: { value: NotificationTab; label: string }[] = [
    { value: "all", label: "All" },
    { value: "unread", label: unreadLabel },
    { value: "trash", label: "Trash" },
  ];

  let emptyText = "No notifications yet.";
  if (q || type) {
    emptyText = "Nothing matches that search.";
  } else if (tab === "unread") {
    emptyText = "You have read them all.";
  } else if (tab === "trash") {
    emptyText = "The trash is empty.";
  }

  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-ink text-3xl font-black">Notifications</h1>
        {tab !== "trash" && data.unread > 0 && (
          <form action={markAllNotificationsReadAction}>
            <PendingButton pendingLabel="Marking…" className="text-brand-hover text-sm font-bold">
              Mark all read
            </PendingButton>
          </form>
        )}
      </div>

      <nav aria-label="Notification tabs" className="flex gap-2">
        {tabs.map((each) => {
          let classes = "text-ink hover:bg-brand-tint rounded-full px-4 py-2 text-sm font-bold";
          let current: "page" | undefined = undefined;
          if (each.value === tab) {
            classes = "bg-ink rounded-full px-4 py-2 text-sm font-bold text-white";
            current = "page";
          }
          return (
            <Link
              key={each.value}
              href={pageLink(each.value, type, q, 1)}
              aria-current={current}
              className={classes}
            >
              {each.label}
            </Link>
          );
        })}
      </nav>

      {/* A plain GET form: searching just changes the address, so Back works as expected. */}
      <form role="search" className="flex flex-wrap gap-2">
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <input
          type="search"
          name="q"
          defaultValue={q}
          aria-label="Search notifications"
          placeholder="Search notifications"
          className="border-brand-tint min-w-0 flex-1 rounded-full border-2 bg-white px-4 py-2 text-sm"
        />
        <select
          name="type"
          defaultValue={type}
          aria-label="Type"
          className="border-brand-tint rounded-full border-2 bg-white px-3 py-2 text-sm"
        >
          <option value="">Every type</option>
          {NOTIFICATION_TYPES.map((each) => (
            <option key={each} value={each}>
              {NOTIFICATION_TYPE_LABELS[each]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-brand rounded-full px-4 py-2 text-sm font-bold text-white"
        >
          Search
        </button>
      </form>

      {tab === "trash" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-muted text-sm">
            Notifications in the trash are deleted for good after 30 days.
          </p>
          {data.total > 0 && (
            <ConfirmButton
              action={emptyNotificationTrashAction}
              label="Empty trash"
              confirmLabel="Yes, delete them all"
              question="Delete everything in the trash for good?"
            />
          )}
        </div>
      )}

      {data.rows.length === 0 && (
        <p className="text-ink-muted rounded-xl bg-white p-5">{emptyText}</p>
      )}
      {/* key: a new tab, search or page starts with nothing ticked. */}
      <NotificationList key={`${tab}-${type}-${q}-${page}`} rows={data.rows} tab={tab} />

      {lastPage > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm">
          {page > 1 && (
            <Link href={pageLink(tab, type, q, page - 1)} className="font-bold underline">
              ← Newer
            </Link>
          )}
          <span className="text-ink-muted">
            Page {page} of {lastPage}
          </span>
          {page < lastPage && (
            <Link href={pageLink(tab, type, q, page + 1)} className="font-bold underline">
              Older →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
