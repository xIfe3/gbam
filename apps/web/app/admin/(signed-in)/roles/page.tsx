import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/admin/action-forms";
import { shortTime } from "@/components/admin/list-bits";
import { param } from "@/components/admin/list-params";
import { RoleForm } from "@/components/admin/team-forms";
import { adminApi } from "@/lib/admin-api";
import {
  createRoleAction,
  deleteRoleAction,
  restoreRoleAction,
  updateRoleAction,
} from "../admin-actions";

export const metadata: Metadata = { title: "Roles · Admin" };

const sectionClass = "rounded-xl border border-zinc-200 bg-white p-5";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Roles = named sets of permissions. Superadmin only. Deleted roles wait 30 days in the bin. */
export default async function RolesPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const showBin = param(searchParams, "bin") === "1";
  const roles = await adminApi.roles(showBin);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Roles</h1>
      <nav aria-label="Role lists" className="flex gap-4 text-sm font-bold">
        <Link href="/admin/roles" className="underline">
          Roles
        </Link>
        <Link href="/admin/roles?bin=1" className="underline">
          Bin
        </Link>
      </nav>

      {showBin && (
        <ul className="space-y-3">
          {roles.length === 0 && <p className="text-zinc-500">The bin is empty.</p>}
          {roles.map((role) => (
            <li key={role.id} className={sectionClass}>
              <p className="font-bold">{role.name}</p>
              <p className="text-sm text-zinc-600">Deleted {shortTime(role.deletedAt)}</p>
              <div className="mt-2">
                <ActionButton action={restoreRoleAction.bind(null, role.id)} label="Restore" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {!showBin && (
        <>
          <section aria-labelledby="new-role-heading" className={sectionClass}>
            <h2 id="new-role-heading" className="mb-3 font-semibold">
              New role
            </h2>
            <RoleForm
              action={createRoleAction}
              name=""
              permissions={[]}
              submitLabel="Create role"
            />
          </section>
          {roles.map((role) => (
            <section key={role.id} aria-label={role.name} className={sectionClass}>
              <p className="mb-3 text-sm text-zinc-600">
                {role.adminCount} {role.adminCount === 1 ? "admin has" : "admins have"} this role
              </p>
              <RoleForm
                action={updateRoleAction.bind(null, role.id)}
                name={role.name}
                permissions={role.permissions}
                submitLabel="Save role"
              />
              {role.adminCount === 0 && (
                <div className="mt-3">
                  <ActionButton action={deleteRoleAction.bind(null, role.id)} label="Delete role" />
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
