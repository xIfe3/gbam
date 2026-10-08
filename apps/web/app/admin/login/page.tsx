import type { Metadata } from "next";
import { AuthCard } from "@/components/brand/auth-card";
import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Admin sign in",
  // Staff only: keep it out of search results.
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <AuthCard title="Gbam admin" subtitle="For the Gbam team. Sellers sign in at gbam.app/login.">
        <AdminLoginForm />
      </AuthCard>
    </main>
  );
}
