import type { AdminPermission } from "@gbam/shared";

/** Just what the menu needs to know about the signed-in admin. */
export type NavAdmin = { isSuperadmin: boolean; permissions: AdminPermission[] };

type NavItem = {
  href: string;
  label: string;
  /** null = every admin; "superadmin" = superadmins only; otherwise this permission. */
  needs: AdminPermission | "superadmin" | null;
};

/** Every admin page, in menu order. Later phases add their pages here. */
const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", needs: null },
  { href: "/admin/shops", label: "Shops", needs: "shops.view" },
  { href: "/admin/orders", label: "Orders", needs: "orders.view" },
  { href: "/admin/refunds", label: "Refunds", needs: "refunds.handle" },
  { href: "/admin/money", label: "Money", needs: "money.view" },
  { href: "/admin/analytics", label: "Analytics", needs: "analytics.view" },
  { href: "/admin/support", label: "Support", needs: "support.view" },
  { href: "/admin/tickets", label: "Tickets", needs: "tickets.view" },
  { href: "/admin/announcements", label: "Announcements", needs: "messages.send" },
  { href: "/admin/notifications", label: "Notifications", needs: "messages.send" },
  { href: "/admin/content", label: "Content", needs: "content.edit" },
  { href: "/admin/audit", label: "Audit log", needs: "audit.view" },
  { href: "/admin/system", label: "System", needs: "system.view" },
  { href: "/admin/settings", label: "Settings", needs: "settings.manage" },
  { href: "/admin/team", label: "Team", needs: "superadmin" },
  { href: "/admin/roles", label: "Roles", needs: "superadmin" },
  { href: "/admin/sessions", label: "Sessions", needs: "superadmin" },
  { href: "/admin/maintenance", label: "Maintenance", needs: "superadmin" },
];

/** Can this admin do this? Superadmins can do everything (the API checks this too). */
export function adminCan(admin: NavAdmin, needs: AdminPermission | "superadmin" | null): boolean {
  if (needs === null || admin.isSuperadmin) {
    return true;
  }
  if (needs === "superadmin") {
    return false;
  }
  return admin.permissions.includes(needs);
}

/**
 * The menu items this admin may open. Hiding a link is only for tidiness: the API refuses
 * anything their role doesn't allow, whatever the menu shows.
 */
export function visibleNav(admin: NavAdmin): { href: string; label: string }[] {
  const items: { href: string; label: string }[] = [];
  for (const item of NAV) {
    if (adminCan(admin, item.needs)) {
      items.push({ href: item.href, label: item.label });
    }
  }
  return items;
}
