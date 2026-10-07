import type { Metadata } from "next";
import { AuthCard, AuthLink } from "@/components/brand/auth-card";
import { FormNotice } from "@/components/brand/form-bits";
import { safeNextPath } from "@/lib/safe-next";
import { redirectIfSignedIn } from "../guard";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Gbam shop to see and manage your orders.",
};

export default async function LoginPage(props: PageProps<"/login">) {
  await redirectIfSignedIn();
  const searchParams = await props.searchParams;
  // Only a path on this site is accepted (otherwise a crafted link could send you elsewhere).
  const next = safeNextPath(searchParams.next);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <AuthCard
        title="Welcome back"
        subtitle="Log in to see your orders."
        footer={
          <>
            New to Gbam? <AuthLink href="/signup">Create your shop</AuthLink>
          </>
        }
      >
        {/* Shown once, right after "Delete my account". */}
        {searchParams.closed === "1" && (
          <div className="mb-4">
            <FormNotice message="Your account is deleted and your shop is hidden. We've been told to remove your data. Thanks for using Gbam." />
          </div>
        )}
        <LoginForm next={next ?? undefined} />
      </AuthCard>
    </main>
  );
}
