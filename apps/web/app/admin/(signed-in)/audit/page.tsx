import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar, filterInputClasses, Pagination, shortTime } from "@/components/admin/list-bits";
import { pageNumber, param } from "@/components/admin/list-params";
import { adminApi } from "@/lib/admin-api";

export const metadata: Metadata = { title: "Audit log · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Every admin action, newest first. Read only: entries can't be changed or deleted. */
export default async function AuditPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const filters = {
    adminId: param(searchParams, "adminId"),
    action: param(searchParams, "action"),
    targetId: param(searchParams, "targetId"),
    batchId: param(searchParams, "batchId"),
    from: param(searchParams, "from"),
    to: param(searchParams, "to"),
  };
  const page = pageNumber(searchParams);
  const result = await adminApi.audit({ ...filters, page });

  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Audit log</h1>
      <FilterBar>
        {filters.adminId && <input type="hidden" name="adminId" value={filters.adminId} />}
        {filters.batchId && <input type="hidden" name="batchId" value={filters.batchId} />}
        <label className="flex flex-col text-sm font-bold">
          Action
          <input
            name="action"
            defaultValue={filters.action}
            placeholder="e.g. shop.suspend"
            className={filterInputClasses}
          />
        </label>
        <label className="flex flex-col text-sm font-bold">
          Shop, order or admin id
          <input name="targetId" defaultValue={filters.targetId} className={filterInputClasses} />
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
      </FilterBar>
      {(filters.adminId || filters.batchId) && (
        <p className="text-sm">
          Showing {filters.adminId && "one admin's actions"}
          {filters.batchId && "one bulk action"}.{" "}
          <Link href="/admin/audit" className="font-bold underline">
            Show everything
          </Link>
        </p>
      )}

      <ul className="space-y-2">
        {result.rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            <p>
              <strong>{row.action}</strong> · {shortTime(row.createdAt)} ·{" "}
              {row.adminId && (
                <Link href={`/admin/audit?adminId=${row.adminId}`} className="underline">
                  {row.adminName ?? "Admin"}
                </Link>
              )}
              {!row.adminId && "System"}
            </p>
            {row.targetType && (
              <p className="text-zinc-600">
                {row.targetType} {row.targetId}
              </p>
            )}
            {row.note && <p className="mt-1">“{row.note}”</p>}
            {row.batchId && (
              <Link href={`/admin/audit?batchId=${row.batchId}`} className="text-xs underline">
                Part of a bulk action
              </Link>
            )}
          </li>
        ))}
      </ul>
      {result.rows.length === 0 && <p className="text-zinc-500">No entries match.</p>}
      <Pagination
        basePath="/admin/audit"
        filters={filters}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}
