import type { Metadata } from "next";
import { MaintenanceForm } from "@/components/admin/settings-forms";
import { adminApi } from "@/lib/admin-api";
import { maintenanceAction } from "../admin-actions";

export const metadata: Metadata = { title: "Maintenance · Admin" };

const LEVEL_TEXT = {
  off: "Off. The site is working normally.",
  pause: "Orders are paused.",
  full: "The whole site shows the maintenance page.",
};

/** Maintenance mode. Superadmin only (the API refuses everyone else). */
export default async function MaintenancePage() {
  const { maintenance } = await adminApi.settings();
  return (
    <div className="space-y-5">
      <h1 className="font-display text-ink text-3xl font-black">Maintenance</h1>
      <p role="status" className="font-medium">
        Now: {LEVEL_TEXT[maintenance.level]}
      </p>
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <MaintenanceForm action={maintenanceAction} maintenance={maintenance} />
      </section>
    </div>
  );
}
