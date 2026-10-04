import { emailSchema } from "@gbam/shared";
import type { Metadata } from "next";
import { AuthCard, AuthLink } from "@/components/brand/auth-card";
import { redirectIfSignedIn } from "../guard";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Choose a new password for your Gbam account.",
};

// Same shape the API requires for a requestId (43 URL-safe characters).
const REQUEST_ID = /^[A-Za-z0-9_-]{43}$/;

export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  await redirectIfSignedIn();
  const searchParams = await props.searchParams;
  const email = emailSchema.safeParse(searchParams.email);
  const requestId = searchParams.request;

  // Without the email and request id from the forgot-password step there is nothing to reset.
  if (!email.success || typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-10">
        <AuthCard
          title="Start your reset again"
          subtitle="This reset page needs the email you entered first."
        >
          <div className="flex justify-center">
            <AuthLink href="/forgot-password">Request a new code</AuthLink>
          </div>
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <AuthCard
        title="Check your email"
        // Same wording whether or not the email has an account (the API never says).
        subtitle="If that email has an account, we've sent a 6-digit code. Enter it with a new password."
        footer={
          <>
            Didn&apos;t get it? <AuthLink href="/forgot-password">Send another code</AuthLink>
          </>
        }
      >
        <ResetForm email={email.data} requestId={requestId} />
      </AuthCard>
    </main>
  );
}
