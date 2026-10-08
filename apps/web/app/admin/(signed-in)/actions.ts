"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import { adminApi } from "@/lib/admin-api";
import { clearAdminCookie } from "@/lib/admin-session";

/** Ends the session on the API, clears the cookie, and goes back to the sign-in page. */
export async function adminLogoutAction(): Promise<void> {
  try {
    await adminApi.logout();
  } catch (error) {
    unstable_rethrow(error);
    // Even if the API call fails, this browser is signed out below.
    console.error("admin logout failed on the API");
  }
  await clearAdminCookie();
  redirect("/admin/login");
}
