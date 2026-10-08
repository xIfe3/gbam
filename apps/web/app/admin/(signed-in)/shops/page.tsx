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
import { adminApi } from "@/lib/admin-api";
import { bulkShopsAction } from "../admin-actions";

export const metadata: Metadata = { title: "Shops · Admin" };

const STATUS_LABEL = { active: "Active", suspended: "Suspended", closed: "Deleted" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ShopsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const filters = {
    q: param(searchParams, "q"),
    status: param(searchParams, "status"),
    hasBank: param(searchParams, "hasBank"),
    hasProducts: param(searchParams, "hasProducts"),
    sort: param(searchParams, "sort"),
  };
  const page = pageNumber(searchParams);
  const me = await adminApi.me();
  const result = await adminApi.shops({ ...filters, page });
  const canSuspend = adminCan(me, "shops.suspend");

  const ids: string[] = [];
  for (const row of result.rows) {
    ids.push(row.id);
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Shops</h1>
      <FilterBar>
        <label className="flex flex-col text-sm font-bold">
          Search
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Name, link or email"
            className={filterInputClasses}
          />
        </label>
        <label className="flex flex-col text-sm font-bold">
          Status
          <select name="status" defaultValue={filters.status} className={filterInputClasses}>
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="closed">Deleted</option>
          </select>
        </label>
        <label className="flex flex-col text-sm font-bold">
          Bank account
          <select name="hasBank" defaultValue={filters.hasBank} className={filterInputClasses}>
            <option value="">Any</option>
            <option value="true">Added</option>
            <option value="false">Not yet</option>
          </select>
        </label>
        <label className="flex flex-col text-sm font-bold">
          Products
          <select
            name="hasProducts"
            defaultValue={filters.hasProducts}
            className={filterInputClasses}
          >
            <option value="">Any</option>
            <option value="true">Has products</option>
            <option value="false">None yet</option>
          </select>
        </label>
        <label className="flex flex-col text-sm font-bold">
          Sort
          <select name="sort" defaultValue={filters.sort} className={filterInputClasses}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
          </select>
        </label>
      </FilterBar>

      <SelectionProvider>
        {canSuspend && (
          <div className="flex flex-wrap gap-2">
            <SelectedBulkAction
              label="Suspend"
              explanation="Customers won't be able to order from or pay these shops until they're reopened. Each owner gets an email."
              risky
              run={bulkShopsAction.bind(null, "suspend")}
            />
            <SelectedBulkAction
              label="Reopen"
              explanation="These shops take orders and payments again. Each owner gets an email."
              run={bulkShopsAction.bind(null, "reopen")}
            />
          </div>
        )}
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-zinc-500">
              <tr>
                {canSuspend && (
                  <th className="p-3">
                    <SelectAllCheckbox ids={ids} />
                  </th>
                )}
                <th className="p-3">Shop</th>
                <th className="p-3">Owner</th>
                <th className="p-3">Status</th>
                <th className="p-3">Products</th>
                <th className="p-3">Bank</th>
                <th className="p-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  {canSuspend && (
                    <td className="p-3">
                      <RowCheckbox id={row.id} label={row.businessName} />
                    </td>
                  )}
                  <td className="p-3">
                    <Link href={`/admin/shops/${row.id}`} className="font-bold underline">
                      {row.businessName}
                    </Link>
                    <span className="block text-zinc-500">/{row.slug}</span>
                  </td>
                  <td className="p-3">{row.ownerEmail ?? "—"}</td>
                  <td className="p-3">{STATUS_LABEL[row.status]}</td>
                  <td className="p-3 tabular-nums">{row.productCount}</td>
                  <td className="p-3">{row.hasBank ? "Yes" : "No"}</td>
                  <td className="p-3">{shortTime(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.rows.length === 0 && <p className="p-5 text-zinc-500">No shops match.</p>}
        </div>
      </SelectionProvider>

      <Pagination
        basePath="/admin/shops"
        filters={filters}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}
