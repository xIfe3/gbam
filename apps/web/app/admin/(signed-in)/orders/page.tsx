import { formatNaira, ORDER_STATUSES } from "@gbam/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, filterInputClasses, Pagination, shortTime } from "@/components/admin/list-bits";
import { pageNumber, param } from "@/components/admin/list-params";
import { adminApi } from "@/lib/admin-api";

export const metadata: Metadata = { title: "Orders · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function OrdersPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const filters = {
    q: param(searchParams, "q"),
    status: param(searchParams, "status"),
    from: param(searchParams, "from"),
    to: param(searchParams, "to"),
    hasIssue: param(searchParams, "hasIssue"),
  };
  const page = pageNumber(searchParams);
  const result = await adminApi.orders({ ...filters, page });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Orders</h1>
      <FilterBar>
        <label className="flex flex-col text-sm font-bold">
          Order code or phone
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="GB-7K2Q"
            className={filterInputClasses}
          />
        </label>
        <label className="flex flex-col text-sm font-bold">
          Status
          <select name="status" defaultValue={filters.status} className={filterInputClasses}>
            <option value="">Any</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-bold">
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from}
            className={filterInputClasses}
          />
        </label>
        <label className="flex flex-col text-sm font-bold">
          To
          <input type="date" name="to" defaultValue={filters.to} className={filterInputClasses} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            name="hasIssue"
            value="true"
            defaultChecked={filters.hasIssue === "true"}
            className="accent-brand size-5"
          />
          Has an open problem
        </label>
      </FilterBar>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500">
            <tr>
              <th className="p-3">Order</th>
              <th className="p-3">Shop</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Status</th>
              <th className="p-3">Total</th>
              <th className="p-3">Placed</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                <td className="p-3">
                  <Link href={`/admin/orders/${row.id}`} className="font-bold underline">
                    {row.code}
                  </Link>
                  {row.openIssues > 0 && (
                    <span className="text-coral-deep block text-xs font-bold">
                      Problem reported
                    </span>
                  )}
                </td>
                <td className="p-3">{row.shopName}</td>
                <td className="p-3">
                  {row.customerName}
                  <span className="block text-zinc-500">+{row.customerPhone}</span>
                </td>
                <td className="p-3">{row.status}</td>
                <td className="p-3 tabular-nums">{formatNaira(row.totalKobo)}</td>
                <td className="p-3">{shortTime(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.rows.length === 0 && <p className="p-5 text-zinc-500">No orders match.</p>}
      </div>

      <Pagination
        basePath="/admin/orders"
        filters={filters}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}
