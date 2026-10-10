/* eslint-disable @next/next/no-img-element -- shop logos and banners are small WebP files from our own storage */
/** "Ada Bakes" → "AB", "Mama Ngozi Kitchen" → "MN": shown when a shop has no logo yet. */
export function shopInitials(businessName: string): string {
  const words = businessName.trim().split(/\s+/);
  let initials = "";
  for (const word of words) {
    if (word !== "" && initials.length < 2) {
      initials = initials + word.charAt(0).toUpperCase();
    }
  }
  if (initials === "") {
    return "?";
  }
  return initials;
}

/** The round logo, or the shop's initials on gbam green. `size` is the CSS size class. */
export function ShopLogo({
  businessName,
  logoUrl,
  className = "size-24 text-3xl",
}: {
  businessName: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${businessName} logo`}
        className={`${className} shrink-0 rounded-full border-4 border-white bg-white object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} bg-brand font-display flex shrink-0 items-center justify-center rounded-full border-4 border-white font-black text-white`}
    >
      {shopInitials(businessName)}
    </span>
  );
}

/** The wide banner, or gbam's default pattern when the shop hasn't added one. */
export function ShopBanner({
  businessName,
  bannerUrl,
}: {
  businessName: string;
  bannerUrl: string | null;
}) {
  if (bannerUrl) {
    return (
      <img
        src={bannerUrl}
        alt={`${businessName} banner`}
        className="aspect-[3/1] w-full rounded-2xl bg-zinc-100 object-cover"
      />
    );
  }
  return (
    <div
      data-testid="default-banner"
      aria-hidden="true"
      className="bg-brand relative aspect-[3/1] w-full overflow-hidden rounded-2xl"
    >
      {/* Soft gbam-coloured circles: a calm default until the seller adds their own. */}
      <span className="bg-brand-hover absolute -top-10 -left-10 size-48 rounded-full opacity-60" />
      <span className="bg-coral absolute -right-8 -bottom-16 size-56 rounded-full opacity-40" />
      <span className="bg-brand-tint absolute top-1/3 left-1/2 size-24 rounded-full opacity-20" />
    </div>
  );
}

/**
 * The top of a shop's page, LinkedIn style: the banner across the top, the round logo over
 * its bottom edge, and the shop's name beside it.
 */
export function ShopCover({
  businessName,
  logoUrl,
  bannerUrl,
  children,
}: {
  businessName: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  /** A line or two under the name. */
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      <ShopBanner businessName={businessName} bannerUrl={bannerUrl} />
      <div className="-mt-10 flex items-end gap-4 px-4 sm:-mt-12">
        <ShopLogo
          businessName={businessName}
          logoUrl={logoUrl}
          className="size-20 text-2xl sm:size-24 sm:text-3xl"
        />
      </div>
      <h1 className="font-display text-ink mt-3 text-3xl leading-tight font-black sm:text-4xl">
        {businessName}
      </h1>
      {children}
    </header>
  );
}
