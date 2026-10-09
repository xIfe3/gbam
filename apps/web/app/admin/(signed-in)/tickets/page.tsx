import {
  TICKET_PRIORITIES,
  TICKET_SOURCES,
  TICKET_STATUS_LABELS,
  TICKET_STATUSES,
} from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { adminCan } from "@/components/admin/admin-nav";
import { FilterBar, filterInputClasses, Pagination, shortTime } from "@/components/admin/list-bits";
import { pageNumber, param } from "@/components/admin/list-params";
import {
  RowCheckbox,
  SelectAllCheckbox,
  SelectedBulkAction,
  SelectionProvider,
} from "@/components/admin/selection";
import { PRIORITY_LABELS } from "@/components/admin/ticket-forms";
import { adminApi } from "@/lib/admin-api";
import { bulkTicketsAction } from "../admin-actions";

export const metadata: Metadata = { title: "Tickets · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SOURCE_LABELS: Record<(typeof TICKET_SOURCES)[number], string> = {
  contact: "Contact form",
  seller: "Seller",
  problem_report: "Customer problem",
};

/** Every support ticket, newest activity first, with filters and bulk actions. */
export default async function TicketsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const filters = {
    q: param(searchParams, "q"),
    status: param(searchParams, "status"),
    priority: param(searchParams, "priority"),
    source: param(searchParams, "source"),
    assignee: param(searchParams, "assignee"),
    from: param(searchParams, "from"),
    to: param(searchParams, "to"),
    bin: param(searchParams, "bin"),
  };
  const page = pageNumber(searchParams);
  const me = await adminApi.me();
  const canHandle = adminCan(me, "tickets.handle");
  const result = await adminApi.tickets({ ...filters, page });
  const inBin = filters.bin === "1";

  const ids: string[] = [];
  for (const row of result.rows) {
    ids.push(row.id);
  }

  let binLink = "/admin/tickets?bin=1";
  let binLabel = "Show the bin";
  if (inBin) {
    binLink = "/admin/tickets";
    binLabel = "Back to tickets";
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-ink text-3xl font-black">Tickets{inBin && " (bin)"}</h1>
        <Link href={binLink} className="text-sm font-bold underline">
          {binLabel}
        </Link>
      </div>
      {inBin && (
        <p className="text-ink-muted text-sm">
          Tickets in the bin are deleted for good 30 days after they were put there.
        </p>
      )}

      <FilterBar>
        {inBin && <input type="hidden" name="bin" value="1" />}
        <label className="flex flex-col text-sm font-bold">
          Search
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="#1042, subject or name"
            className={filterInputClasses}
          />
        </label>
        <label className="flex flex-col text-sm font-bold">
          Status
          <select name="status" defaultValue={filters.status} className={filterInputClasses}>
            <option value="">Any</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TICKET_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-bold">
          Priority
          <select name="priority" defaultValue={filters.priority} className={filterInputClasses}>
            <option value="">Any</option>
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-bold">
          From
          <select name="source" defaultValue={filters.source} className={filterInputClasses}>
            <option value="">Anywhere</option>
            {TICKET_SOURCES.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-bold">
          Assigned
          <select name="assignee" defaultValue={filters.assignee} className={filterInputClasses}>
            <option value="">Anyone</option>
            <option value="me">Me</option>
            <option value="none">Nobody</option>
          </select>
        </label>
        <label className="flex flex-col text-sm font-bold">
          Since
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            className={filterInputClasses}
          />
        </label>
        <label className="flex flex-col text-sm font-bold">
          Until
          <input type="date" name="to" defaultValue={filters.to} className={filterInputClasses} />
        </label>
      </FilterBar>

      <SelectionProvider>
        {canHandle && !inBin && (
          <div className="flex flex-wrap gap-2">
            <SelectedBulkAction
              label="Assign to me"
              explanation="These tickets will be assigned to you. You'll get an email when the person who asked replies."
              run={bulkTicketsAction.bind(null, { action: "assign", assigneeId: me.id })}
            />
            <SelectedBulkAction
              label="Unassign"
              explanation="These tickets will be assigned to nobody."
              run={bulkTicketsAction.bind(null, { action: "assign", assigneeId: null })}
            />
            <SelectedBulkAction
              label="Mark solved"
              explanation="These tickets will be marked solved. If nobody replies for 7 days they close by themselves."
              run={bulkTicketsAction.bind(null, { action: "status", status: "solved" })}
            />
            <SelectedBulkAction
              label="Mark urgent"
              explanation="These tickets will be marked urgent."
              run={bulkTicketsAction.bind(null, { action: "priority", priority: "urgent" })}
            />
            <SelectedBulkAction
              label="Close"
              explanation="These tickets will be closed. The people who asked can't reply to them any more."
              run={bulkTicketsAction.bind(null, { action: "close" })}
            />
            <SelectedBulkAction
              label="Move to the bin"
              explanation="These tickets go to the bin. They can be restored for 30 days, then they're deleted for good."
              risky
              run={bulkTicketsAction.bind(null, { action: "delete" })}
            />
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500">
              <tr>
                {canHandle && !inBin && (
                  <th className="p-3">
                    <SelectAllCheckbox ids={ids} />
                  </th>
                )}
                <th className="p-3">Ticket</th>
                <th className="p-3">From</th>
                <th className="p-3">Status</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Assigned</th>
                <th className="p-3">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                let from = row.requesterName;
                if (row.shopName) {
                  from = `${row.requesterName} (${row.shopName})`;
                }
                let priorityClasses = "p-3";
                if (row.priority === "urgent") {
                  priorityClasses = "text-coral-deep p-3 font-bold";
                }
                return (
                  <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                    {canHandle && !inBin && (
                      <td className="p-3">
                        <RowCheckbox id={row.id} label={row.subject} />
                      </td>
                    )}
                    <td className="p-3">
                      <Link href={`/admin/tickets/${row.id}`} className="font-bold underline">
                        {row.subject}
                      </Link>
                      <span className="block text-zinc-500">
                        #{row.number} · {SOURCE_LABELS[row.source]}
                      </span>
                    </td>
                    <td className="p-3">{from}</td>
                    <td className="p-3">{TICKET_STATUS_LABELS[row.status]}</td>
                    <td className={priorityClasses}>{PRIORITY_LABELS[row.priority]}</td>
                    <td className="p-3">{row.assigneeName ?? "—"}</td>
                    <td className="p-3">{shortTime(row.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {result.rows.length === 0 && <p className="p-5 text-zinc-500">No tickets match.</p>}
        </div>
      </SelectionProvider>
      <Pagination
        basePath="/admin/tickets"
        filters={filters}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}
