import type { Maintenance } from "@gbam/shared";

/** Pages that take orders, payments or seller sign-ins: closed during "Pause orders". */
const PAUSED_PREFIXES = [
  "/pay",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/dashboard",
];

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Should this page show the maintenance page instead?
 * - "full": every page except the admin area (and the maintenance page itself).
 * - "pause": checkout ("/{shop}/order"), paying, seller sign-in/sign-up and the dashboard.
 *   Shop pages and order tracking stay visible.
 */
export function maintenanceRewrites(level: Maintenance["level"], pathname: string): boolean {
  if (level === "off") {
    return false;
  }
  if (underPrefix(pathname, "/admin") || pathname === "/maintenance") {
    return false;
  }
  if (level === "full") {
    return true;
  }
  for (const prefix of PAUSED_PREFIXES) {
    if (underPrefix(pathname, prefix)) {
      return true;
    }
  }
  // "/{shop}/order": a shop's checkout page.
  return /^\/[^/]+\/order$/.test(pathname);
}
