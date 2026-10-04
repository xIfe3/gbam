import { redirect } from "next/navigation";
import { api } from "@/lib/api";

/**
 * Logged-in visitors have no business on /login or /signup: send them to the dashboard.
 * Checks with the API (not just "is there a cookie") so an expired cookie does not trap
 * someone in a redirect loop between /login and /dashboard.
 */
export async function redirectIfSignedIn(): Promise<void> {
  const user = await api.currentUserOrNull();
  if (user) {
    redirect("/dashboard");
  }
}
