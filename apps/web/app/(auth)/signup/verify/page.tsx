import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { SignupFrame } from "../frame";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyPage() {
  // No session: log in first (api redirects). Already verified: nothing to do here.
  const user = await api.currentUser();
  if (user.emailVerified) {
    redirect("/dashboard");
  }

  return (
    <SignupFrame
      step={2}
      title="Check your email"
      subtitle="We sent a 6-digit code. It expires in 15 minutes."
    >
      <VerifyForm email={user.email} />
    </SignupFrame>
  );
}
