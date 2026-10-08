import type { Metadata } from "next";
import { AuthLink } from "@/components/brand/auth-card";
import { getPlatformInfo } from "@/lib/platform-info";
import { redirectIfSignedIn } from "../guard";
import { SignupFrame } from "./frame";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create your shop",
  description: "Set up your Gbam shop in minutes and start taking orders on WhatsApp.",
};

export default async function SignupPage() {
  await redirectIfSignedIn();
  // Admin → Settings can pause new sign-ups. If the status can't be read, the form shows
  // (the API still refuses a sign-up while they're paused).
  const info = await getPlatformInfo();
  const signupsOpen = info === null || info.signupsOpen;

  return (
    <SignupFrame
      step={1}
      title="Name your shop"
      subtitle="This is what your customers will see. It takes about two minutes."
    >
      {signupsOpen && <SignupForm />}
      {!signupsOpen && (
        <p role="status" className="bg-coral-wash text-ink rounded-lg p-4">
          New sign-ups are paused for now. Please check back soon.
        </p>
      )}
      <p className="text-ink-muted mt-6 text-sm">
        Already have a shop? <AuthLink href="/login">Log in</AuthLink>
      </p>
    </SignupFrame>
  );
}
