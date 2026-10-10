import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import { StagingBanner } from "@/components/staging-banner";
import { isStaging } from "@/lib/app-env";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  // Makes relative URLs in metadata (like the Open Graph image) absolute.
  metadataBase: new URL(SITE_URL),
  title: { default: "Gbam", template: "%s · Gbam" },
  description: "Take orders and get paid on WhatsApp.",
  openGraph: { siteName: "Gbam", type: "website", locale: "en_NG" },
};
// The staging copy: tell search engines not to list any page, even ones they find by a link.
if (isStaging()) {
  metadata.robots = { index: false, follow: false };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body className="min-h-dvh">
        <StagingBanner />
        {children}
      </body>
    </html>
  );
}
