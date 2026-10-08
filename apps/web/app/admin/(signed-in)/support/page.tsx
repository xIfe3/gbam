import { ISSUE_REASON_LABEL, type IssueReason } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ReasonForm } from "@/components/admin/action-forms";
import { adminCan } from "@/components/admin/admin-nav";
import { shortTime } from "@/components/admin/list-bits";
import { param } from "@/components/admin/list-params";
import {
  RowCheckbox,
  SelectAllCheckbox,
  SelectedBulkAction,
  SelectionProvider,
} from "@/components/admin/selection";
import { adminApi } from "@/lib/admin-api";
import {
  bulkHandleMessagesAction,
  handleMessageAction,
  resolveIssueAction,
} from "../admin-actions";

export const metadata: Metadata = { title: "Support · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Contact-form messages and customers' problem reports. */
export default async function SupportPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const tab = param(searchParams, "tab");
  const showHandled = param(searchParams, "status") === "handled";
  const me = await adminApi.me();
  const canHandle = adminCan(me, "support.handle");

  const tabs = (
    <nav aria-label="Support lists" className="flex flex-wrap gap-4 text-sm font-bold">
      <Link href="/admin/support" className="underline">
        Messages
      </Link>
      <Link href="/admin/support?status=handled" className="underline">
        Handled messages
      </Link>
      <Link href="/admin/support?tab=issues" className="underline">
        Problem reports
      </Link>
    </nav>
  );

  if (tab === "issues") {
    const issues = await adminApi.issues("open");
    return (
      <div className="space-y-5">
        <h1 className="font-display text-ink text-3xl font-black">Support</h1>
        {tabs}
        <p className="text-sm text-zinc-600">
          Problems customers reported on their orders. The shop sees these too; step in when a
          seller isn&apos;t responding.
        </p>
        {issues.length === 0 && <p className="text-zinc-500">No open problem reports.</p>}
        <ul className="space-y-3">
          {issues.map((issue) => (
            <li key={issue.id} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
              <p className="font-bold">
                <Link href={`/admin/orders/${issue.orderId}`} className="underline">
                  {issue.orderCode}
                </Link>{" "}
                · {issue.shopName} ·{" "}
                {ISSUE_REASON_LABEL[issue.reason as IssueReason] ?? issue.reason}
              </p>
              {issue.note && <p className="mt-1">{issue.note}</p>}
              <p className="text-zinc-500">{shortTime(issue.createdAt)}</p>
              {canHandle && (
                <details className="mt-2">
                  <summary className="min-h-11 cursor-pointer content-center font-bold">
                    Mark resolved
                  </summary>
                  <ReasonForm
                    action={resolveIssueAction.bind(null, issue.id)}
                    label="Mark resolved"
                    pendingLabel="Saving…"
                    reasonLabel="Note (for the audit log)"
                  />
                </details>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  let status: "new" | "handled" = "new";
  if (showHandled) {
    status = "handled";
  }
  const messages = await adminApi.messages(status);
  const ids: string[] = [];
  for (const message of messages) {
    ids.push(message.id);
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Support</h1>
      {tabs}
      <SelectionProvider>
        {canHandle && status === "new" && (
          <div className="flex items-center gap-3">
            <SelectAllCheckbox ids={ids} />
            <SelectedBulkAction
              label="Mark handled"
              explanation="These messages move to Handled with your note."
              run={bulkHandleMessagesAction}
            />
          </div>
        )}
        {messages.length === 0 && <p className="text-zinc-500">No messages here.</p>}
        <ul className="space-y-3">
          {messages.map((message) => (
            <li key={message.id} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
              <div className="flex items-start gap-3">
                {canHandle && status === "new" && (
                  <RowCheckbox id={message.id} label={`message from ${message.name}`} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold">
                    {message.name} · {message.email}
                    {message.phone && ` · +${message.phone}`}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{message.message}</p>
                  <p className="text-zinc-500">{shortTime(message.createdAt)}</p>
                  {message.handledNote && (
                    <p className="mt-1 text-zinc-600">Handled: {message.handledNote}</p>
                  )}
                </div>
              </div>
              {canHandle && status === "new" && (
                <details className="mt-2">
                  <summary className="min-h-11 cursor-pointer content-center font-bold">
                    Mark handled
                  </summary>
                  <ReasonForm
                    action={handleMessageAction.bind(null, message.id)}
                    label="Mark handled"
                    pendingLabel="Saving…"
                    reasonLabel="What you did (for the audit log)"
                  />
                </details>
              )}
            </li>
          ))}
        </ul>
      </SelectionProvider>
    </div>
  );
}
