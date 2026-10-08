import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import QRCode from "qrcode";
import { AuthCard } from "@/components/brand/auth-card";
import { adminApi } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = {
  title: "Join the Gbam admin",
  robots: { index: false, follow: false },
};

type Invite = { email: string; name: string; secret: string; otpauthUrl: string };

/** The invite, or null when the link is unknown, used or expired (the API says 404). */
async function loadInvite(token: string): Promise<Invite | null> {
  try {
    return await adminApi.viewInvite(token);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export default async function InvitePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const invite = await loadInvite(token);

  if (invite === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="max-w-md text-center">
          <h1 className="font-display text-ink text-2xl font-black">This invite has expired</h1>
          <p className="text-ink-muted mt-3">
            Invite links work once and last 48 hours. Ask the person who invited you for a new one.
          </p>
          <Link
            href="/admin/login"
            className="text-brand-hover mt-4 inline-block font-bold underline"
          >
            Admin sign in
          </Link>
        </div>
      </main>
    );
  }

  // The QR code an authenticator app scans, drawn as an SVG on the server.
  const qrSvg = await QRCode.toString(invite.otpauthUrl, { type: "svg", margin: 1, width: 200 });

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <AuthCard title={`Welcome, ${invite.name}`} subtitle="Set up your Gbam admin account.">
        <p className="text-ink-muted mb-4 text-sm">
          Signing in as <strong className="text-ink">{invite.email}</strong>
        </p>
        <ol className="text-ink mb-5 list-decimal space-y-2 pl-5 text-sm">
          <li>Install an authenticator app (Google Authenticator or Microsoft Authenticator).</li>
          <li>In the app, add an account and scan this code:</li>
        </ol>
        {/* The SVG comes from the qrcode library, built from our own link, not from a user. */}
        <div
          className="mx-auto mb-3 w-[200px] rounded-lg bg-white p-2"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <p className="text-ink-muted mb-5 text-center text-xs">
          Can&apos;t scan? Type this key into the app:{" "}
          <code className="text-ink font-mono break-all">{invite.secret}</code>
        </p>
        <AcceptInviteForm token={token} />
      </AuthCard>
    </main>
  );
}
