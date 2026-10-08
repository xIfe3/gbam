import type { Metadata } from "next";
import { SettingsForm } from "@/components/admin/settings-forms";
import { adminApi } from "@/lib/admin-api";
import { saveSettingsAction } from "../admin-actions";

export const metadata: Metadata = { title: "Settings · Admin" };

/** Platform values that used to need a deploy to change. Needs settings.manage. */
export default async function SettingsPage() {
  const { settings } = await adminApi.settings();
  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Settings</h1>
      <p className="text-sm text-zinc-600">
        Every change is in the audit log. Other parts of Gbam pick it up within 30 seconds.
      </p>
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <SettingsForm action={saveSettingsAction} settings={settings} />
      </section>
    </div>
  );
}
