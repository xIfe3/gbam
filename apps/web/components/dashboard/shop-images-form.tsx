"use client";

import { useId, useState, useTransition } from "react";
import { removeShopImageAction, uploadShopImageAction } from "@/app/dashboard/settings/actions";
import { FormError } from "@/components/brand/form-bits";
import { ShopBanner, ShopLogo } from "@/components/shop/shop-cover";

type Kind = "logo" | "banner";

const buttonClasses =
  "border-brand text-brand hover:bg-brand-tint inline-flex min-h-11 cursor-pointer items-center rounded-full border-2 bg-white px-4 text-sm font-bold disabled:opacity-60";

/** One picture: a preview, an upload button (the file box is hidden behind it), and Remove. */
function ImagePicker({
  kind,
  label,
  url,
  onChange,
  preview,
}: {
  kind: Kind;
  label: string;
  url: string | null;
  onChange: (url: string | null) => void;
  preview: React.ReactNode;
}) {
  const [busy, startWork] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const inputId = useId();

  function upload(file: File) {
    startWork(async () => {
      setError(undefined);
      const data = new FormData();
      data.set("image", file);
      const result = await uploadShopImageAction(kind, data);
      if (result.url) {
        onChange(result.url);
      } else {
        setError(result.error);
      }
    });
  }

  function remove() {
    startWork(async () => {
      setError(undefined);
      const result = await removeShopImageAction(kind);
      if (result.error) {
        setError(result.error);
      } else {
        onChange(null);
      }
    });
  }

  let uploadLabel = `Upload a ${kind}`;
  if (url) {
    uploadLabel = `Change ${kind}`;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink text-sm font-bold">{label}</p>
      {preview}
      <div className="flex flex-wrap gap-2">
        <label htmlFor={inputId} className={buttonClasses}>
          {busy && "Working…"}
          {!busy && uploadLabel}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          aria-label={`Upload a ${kind}`}
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              upload(file);
            }
          }}
        />
        {url && (
          <button type="button" onClick={remove} disabled={busy} className={buttonClasses}>
            Remove {kind}
          </button>
        )}
      </div>
      <FormError message={error} />
    </div>
  );
}

/**
 * The shop's logo (square, shown round) and banner (wide). Each saves as soon as it's chosen.
 * Without them the shop shows its initials and a gbam pattern.
 */
export function ShopImagesForm({
  businessName,
  logoUrl,
  bannerUrl,
}: {
  businessName: string;
  logoUrl: string | null;
  bannerUrl: string | null;
}) {
  const [logo, setLogo] = useState(logoUrl);
  const [banner, setBanner] = useState(bannerUrl);
  return (
    <div className="flex flex-col gap-6">
      <ImagePicker
        kind="banner"
        label="Banner (wide, across the top of your shop page)"
        url={banner}
        onChange={setBanner}
        preview={<ShopBanner businessName={businessName} bannerUrl={banner} />}
      />
      <ImagePicker
        kind="logo"
        label="Logo (square, shown round)"
        url={logo}
        onChange={setLogo}
        preview={<ShopLogo businessName={businessName} logoUrl={logo} />}
      />
      <p className="text-ink-muted text-sm">JPEG or PNG, up to 10 MB. We crop it to fit.</p>
    </div>
  );
}
