import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton, ReasonForm } from "@/components/admin/action-forms";
import { deviceName, shortIp } from "@/components/admin/device";
import { FilterBar, filterInputClasses, shortTime } from "@/components/admin/list-bits";
import { param } from "@/components/admin/list-params";
import { adminApi, type AdminSessionRow, type SellerSessionRow } from "@/lib/admin-api";
import {
  endAdminSessionAction,
  endAllAdminSessionsAction,
  endSellerSessionAction,
} from "../admin-actions";

export const metadata: Metadata = { title: "Sessions · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Who is signed in right now. Superadmin only (the API refuses everyone else). */
export default async function SessionsPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  let tab: "admins" | "sellers" = "admins";
  if (param(searchParams, "tab") === "sellers") {
    tab = "sellers";
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Sessions</h1>
      <nav aria-label="Session lists" className="flex gap-4 text-sm font-bold">
        <Link
          href="/admin/sessions"
          aria-current={tab === "admins" ? "page" : undefined}
          className="underline"
        >
          Admins
        </Link>
        <Link
          href="/admin/sessions?tab=sellers"
          aria-current={tab === "sellers" ? "page" : undefined}
          className="underline"
        >
          Sellers
        </Link>
      </nav>
      {tab === "admins" && <AdminSessions rows={await adminApi.adminSessions()} />}
      {tab === "sellers" && (
        <SellerSessions
          q={param(searchParams, "q")}
          rows={await adminApi.sellerSessions(param(searchParams, "q"))}
        />
      )}
    </div>
  );
}

function AdminSessions({ rows }: { rows: AdminSessionRow[] }) {
  // "Sign out everywhere" once per admin, on their first row.
  const offeredEndAll: string[] = [];

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        let showEndAll = false;
        if (!row.isCurrent && !offeredEndAll.includes(row.adminId)) {
          offeredEndAll.push(row.adminId);
          showEndAll = true;
        }
        return (
          <li key={row.id} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            <p className="font-bold">
              {row.adminName} · {row.isSuperadmin ? "Superadmin" : (row.roleName ?? "No role")}
            </p>
            <p>
              {deviceName(row.userAgent)} · {shortIp(row.ip)} · signed in {shortTime(row.createdAt)}{" "}
              · last active {shortTime(row.lastUsedAt)}
            </p>
            {row.isCurrent && <p className="text-brand-hover mt-2 font-bold">This device</p>}
            {!row.isCurrent && (
              <div className="mt-2 flex flex-wrap gap-3">
                <ActionButton action={endAdminSessionAction.bind(null, row.id)} label="Sign out" />
                {showEndAll && (
                  <ActionButton
                    action={endAllAdminSessionsAction.bind(null, row.adminId)}
                    label="Sign out everywhere"
                  />
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SellerSessions({ q, rows }: { q: string; rows: SellerSessionRow[] }) {
  return (
    <div className="space-y-4">
      <FilterBar>
        <input type="hidden" name="tab" value="sellers" />
        <label className="flex flex-col text-sm font-bold">
          Shop or email
          <input name="q" defaultValue={q} className={filterInputClasses} />
        </label>
      </FilterBar>
      <p className="text-sm text-zinc-500">
        Seller sessions note activity about once a day, so &quot;last active&quot; is approximate.
      </p>
      {rows.length === 0 && <p className="text-zinc-500">No sellers signed in.</p>}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
            <p className="font-bold">
              {row.shopName} · {row.email}
            </p>
            <p>
              {deviceName(row.userAgent)} · {shortIp(row.ip)} · signed in {shortTime(row.createdAt)}{" "}
              · active {shortTime(row.lastUsedAt)}
            </p>
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer content-center font-bold">
                Sign out
              </summary>
              <ReasonForm
                action={endSellerSessionAction.bind(null, row.id)}
                label="Sign this seller out"
                pendingLabel="Signing out…"
              />
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
