import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/brand/button";
import { ShopImagesForm } from "@/components/dashboard/shop-images-form";
import { api } from "@/lib/api";
import { SignupFrame } from "../frame";

export const metadata: Metadata = {
  title: "Your look",
  description: "Add your logo and a banner for your shop page.",
};

/** Step 3, optional: the shop's logo and banner. Can be skipped and done later in Settings. */
export default async function YourLookPage() {
  // No session: log in first (api redirects). Unverified: finish step 2 first.
  const user = await api.currentUser();
  if (!user.emailVerified) {
    redirect("/signup/verify");
  }
  if (!user.seller) {
    redirect("/dashboard");
  }
  const settings = await api.getSettings();

  return (
    <SignupFrame
      step={3}
      title="Make your shop look like yours"
      subtitle="Add your logo and a banner for the top of your shop page. You can skip this and do it later in Settings."
    >
      <div className="flex flex-col gap-8">
        <ShopImagesForm
          businessName={settings.businessName}
          logoUrl={settings.logoUrl}
          bannerUrl={settings.bannerUrl}
        />
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" href="/signup/get-paid">
            Continue
          </Button>
          <Button variant="ghost" href="/signup/get-paid">
            Skip for now
          </Button>
        </div>
      </div>
    </SignupFrame>
  );
}
