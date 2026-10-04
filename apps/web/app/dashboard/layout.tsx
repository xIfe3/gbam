import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand/logo";
import { api } from "@/lib/api";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // A missing or expired session redirects to /login inside api.currentUser().
  const user = await api.currentUser();
  // Unverified accounts can only reach the verify step.
  if (!user.emailVerified) {
    redirect("/signup/verify");
  }

  let shopName = user.email;
  if (user.seller) {
    shopName = user.seller.businessName;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="focus-visible:outline-brand flex min-h-11 min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Logo size="sm" />
          <span className="text-ink-muted truncate text-sm font-medium">{shopName}</span>
        </Link>
        <form action={logoutAction}>
          <button
            type="submit"
            className="text-ink focus-visible:outline-brand hover:bg-brand-tint min-h-11 rounded-full border-2 border-brand-tint px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Log out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
