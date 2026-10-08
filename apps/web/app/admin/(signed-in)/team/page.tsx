import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/action-forms";
import { shortTime } from "@/components/admin/list-bits";
import { AdminRoleForm, InviteForm } from "@/components/admin/team-forms";
import { adminApi } from "@/lib/admin-api";
import {
  inviteAdminAction,
  removeAdminAction,
  resetAuthenticatorAction,
  updateAdminAction,
} from "../admin-actions";

export const metadata: Metadata = { title: "Team · Admin" };

const sectionClass = "rounded-xl border border-zinc-200 bg-white p-5";

/** The Gbam team: who has access, with which role. Superadmin only. */
export default async function TeamPage() {
  const me = await adminApi.me();
  const team = await adminApi.team();
  const roles = await adminApi.roles(false);
  const roleOptions = roles.map((role) => ({ id: role.id, name: role.name }));

  const active = team.admins.filter((admin) => admin.removedAt === null);
  const removed = team.admins.filter((admin) => admin.removedAt !== null);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Team</h1>

      <section aria-labelledby="invite-heading" className={sectionClass}>
        <h2 id="invite-heading" className="mb-3 font-semibold">
          Invite someone
        </h2>
        <InviteForm action={inviteAdminAction} roles={roleOptions} />
      </section>

      {team.invites.length > 0 && (
        <section aria-labelledby="pending-heading" className={sectionClass}>
          <h2 id="pending-heading" className="mb-2 font-semibold">
            Invites not accepted yet
          </h2>
          <ul className="space-y-1 text-sm">
            {team.invites.map((invite) => (
              <li key={invite.id}>
                {invite.name} · {invite.email} · expires {shortTime(invite.expiresAt)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="space-y-3">
        {active.map((admin) => {
          const isMe = admin.id === me.id;
          return (
            <li key={admin.id} className={sectionClass}>
              <p className="font-bold">
                {admin.name} · {admin.email}
                {isMe && " (you)"}
              </p>
              <p className="text-sm text-zinc-600">
                {admin.isSuperadmin ? "Superadmin" : (admin.roleName ?? "No role")} · joined{" "}
                {shortTime(admin.createdAt)}
                {admin.lockedUntil && ` · locked until ${shortTime(admin.lockedUntil)}`}
              </p>
              {!isMe && (
                <div className="mt-3 space-y-3">
                  <AdminRoleForm
                    action={updateAdminAction.bind(null, admin.id)}
                    roles={roleOptions}
                    roleId={admin.roleId}
                    isSuperadmin={admin.isSuperadmin}
                  />
                  <div className="flex flex-wrap gap-3">
                    <ActionButton
                      action={resetAuthenticatorAction.bind(null, admin.id)}
                      label="Reset authenticator"
                    />
                    <ActionButton action={removeAdminAction.bind(null, admin.id)} label="Remove" />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {removed.length > 0 && (
        <section aria-labelledby="removed-heading" className={sectionClass}>
          <h2 id="removed-heading" className="mb-2 font-semibold">
            Removed
          </h2>
          <ul className="space-y-1 text-sm text-zinc-600">
            {removed.map((admin) => (
              <li key={admin.id}>
                {admin.name} · {admin.email} · removed {shortTime(admin.removedAt)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
