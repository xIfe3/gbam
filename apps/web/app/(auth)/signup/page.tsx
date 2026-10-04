import type { Metadata } from "next";
import { AuthLink } from "@/components/brand/auth-card";
import { redirectIfSignedIn } from "../guard";
import { SignupFrame } from "./frame";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your shop" };

export default async function SignupPage() {
  await redirectIfSignedIn();

  return (
    <SignupFrame
      step={1}
      title="Name your shop"
      subtitle="This is what your customers will see. It takes about two minutes."
    >
      <SignupForm />
      <p className="text-ink-muted mt-6 text-sm">
        Already have a shop? <AuthLink href="/login">Log in</AuthLink>
      </p>
    </SignupFrame>
  );
}
