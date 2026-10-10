import { CONTENT_STATUSES, CONTENT_TYPE_LABELS, EDITABLE_CONTENT_TYPES } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-forms";
import { FilterBar, filterInputClasses, shortTime } from "@/components/admin/list-bits";
import { param } from "@/components/admin/list-params";
import { adminApi } from "@/lib/admin-api";
import { restoreContentAction } from "../content-actions";
import { CONTENT_STATUS_LABELS, typeLabel } from "./labels";

export const metadata: Metadata = { title: "Content · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Help articles, FAQs, blog posts, changelog and legal pages. */
export default async function ContentPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const filters = {
    type: param(searchParams, "type"),
    status: param(searchParams, "status"),
    q: param(searchParams, "q"),
    bin: param(searchParams, "bin"),
  };
  const inBin = filters.bin === "1";
  const rows = await adminApi.contentList(filters);

  let binLink = "/admin/content?bin=1";
  let binLabel = "Show the bin";
  if (inBin) {
    binLink = "/admin/content";
    binLabel = "Back to content";
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-ink text-3xl font-black">Content{inBin && " (bin)"}</h1>
        <div className="flex flex-wrap gap-4">
          <Link href="/admin/content/marketing" className="text-sm font-bold underline">
            Marketing pages
          </Link>
          <Link href={binLink} className="text-sm font-bold underline">
            {binLabel}
          </Link>
          {!inBin && (
            <Link
              href="/admin/content/new"
              className="bg-brand rounded-full px-4 py-2 text-sm font-bold text-white"
            >
              New entry
            </Link>
          )}
        </div>
      </div>

      <FilterBar>
        {inBin && <input type="hidden" name="bin" value="1" />}
        <label className="flex flex-col text-sm font-bold">
          Search
          <input type="search" name="q" defaultValue={filters.q} className={filterInputClasses} />
        </label>
        <label className="flex flex-col text-sm font-bold">
          Kind
          <select name="type" defaultValue={filters.type} className={filterInputClasses}>
            <option value="">Any</option>
            {EDITABLE_CONTENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONTENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-bold">
          Status
          <select name="status" defaultValue={filters.status} className={filterInputClasses}>
            <option value="">Any</option>
            {CONTENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CONTENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500">
            <tr>
              <th className="p-3">Title</th>
              <th className="p-3">Kind</th>
              <th className="p-3">Status</th>
              <th className="p-3">Changed</th>
              {inBin && (
                <th className="p-3">
                  <span className="sr-only">Restore</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                <td className="p-3">
                  <Link href={`/admin/content/${row.id}`} className="font-bold underline">
                    {row.title}
                  </Link>
                  <span className="block text-zinc-500">/{row.slug}</span>
                </td>
                <td className="p-3">{typeLabel(row.type)}</td>
                <td className="p-3">
                  {CONTENT_STATUS_LABELS[row.status]}
                  {row.hasDraft && (
                    <span className="text-coral-deep block text-xs font-bold">
                      Unpublished changes
                    </span>
                  )}
                </td>
                <td className="p-3">{shortTime(row.updatedAt)}</td>
                {inBin && (
                  <td className="p-3">
                    <ActionButton
                      action={restoreContentAction.bind(null, row.id)}
                      label="Restore"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-5 text-zinc-500">Nothing matches.</p>}
      </div>
    </div>
  );
}
