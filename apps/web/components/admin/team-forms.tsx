"use client";

import { ADMIN_PERMISSION_LABELS, ADMIN_PERMISSIONS, type AdminPermission } from "@gbam/shared";
import { useActionState } from "react";
import type { FormState } from "@/app/(auth)/action-helpers";
import { TextField } from "@/components/brand/fields";
import { FormError, FormNotice, SubmitButton } from "@/components/brand/form-bits";

type FormAction = (previous: FormState, formData: FormData) => Promise<FormState>;
type RoleOption = { id: string; name: string };

const selectClasses = "min-h-11 rounded-lg border-2 border-zinc-200 bg-white px-2";

function RoleSelect({
  roles,
  defaultValue,
  error,
}: {
  roles: RoleOption[];
  defaultValue: string;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-bold">
      Role
      <select name="roleId" defaultValue={defaultValue} className={selectClasses}>
        <option value="">No role (superadmins only)</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-coral-deep font-medium">
          {error}
        </span>
      )}
    </label>
  );
}

/** Invite someone new: name, email, role (or superadmin). */
export function InviteForm({ action, roles }: { action: FormAction; roles: RoleOption[] }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <TextField
        label="Name"
        name="name"
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <RoleSelect roles={roles} defaultValue="" error={state.fieldErrors?.roleId} />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="isSuperadmin" className="accent-brand size-5" />
        Superadmin (can manage the team, roles and sessions)
      </label>
      <div>
        <SubmitButton pendingLabel="Sending…">Send invite</SubmitButton>
      </div>
    </form>
  );
}

/** Change an existing admin's role or superadmin flag. */
export function AdminRoleForm({
  action,
  roles,
  roleId,
  isSuperadmin,
}: {
  action: FormAction;
  roles: RoleOption[];
  roleId: string | null;
  isSuperadmin: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" noValidate>
      <RoleSelect roles={roles} defaultValue={roleId ?? ""} error={state.fieldErrors?.roleId} />
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isSuperadmin"
          defaultChecked={isSuperadmin}
          className="accent-brand size-5"
        />
        Superadmin
      </label>
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
    </form>
  );
}

/** A role's name and its permissions, as ticks grouped by area. */
export function RoleForm({
  action,
  name,
  permissions,
  submitLabel,
}: {
  action: FormAction;
  name: string;
  permissions: AdminPermission[];
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  // Group the permissions by area ("Shops", "Orders", ...) for the screen.
  const areas: string[] = [];
  for (const permission of ADMIN_PERMISSIONS) {
    const area = ADMIN_PERMISSION_LABELS[permission].area;
    if (!areas.includes(area)) {
      areas.push(area);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <FormError message={state.error} />
      <FormNotice message={state.notice} />
      <TextField
        label="Role name"
        name="name"
        defaultValue={name}
        error={state.fieldErrors?.name}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {areas.map((area) => (
          <fieldset key={area} className="rounded-lg border border-zinc-200 p-3">
            <legend className="px-1 text-sm font-bold">{area}</legend>
            {ADMIN_PERMISSIONS.filter(
              (permission) => ADMIN_PERMISSION_LABELS[permission].area === area,
            ).map((permission) => (
              <label key={permission} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="permissions"
                  value={permission}
                  defaultChecked={permissions.includes(permission)}
                  className="accent-brand size-5"
                />
                {ADMIN_PERMISSION_LABELS[permission].label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
      <div>
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
