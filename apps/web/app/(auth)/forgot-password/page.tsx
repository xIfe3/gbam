import type { Metadata } from "next";
import { AuthCard, AuthLink } from "@/components/brand/auth-card";
import { redirectIfSignedIn } from "../guard";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Get a code by email to reset your Gbam password.",
};

export default async function ForgotPasswordPage() {
  await redirectIfSignedIn();

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <AuthCard
        title="Forgot your password?"
        subtitle="Enter your email and we'll send you a 6-digit code."
        footer={
          <>
            Remembered it? <AuthLink href="/login">Back to log in</AuthLink>
          </>
        }
      >
        <ForgotForm />
      </AuthCard>
    </main>
  );
}
