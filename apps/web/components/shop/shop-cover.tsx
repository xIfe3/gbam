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

/** At most this many product photos in the strip, so each stays big enough on a phone. */
const MAX_BANNER_PHOTOS = 3;

/**
 * The wide banner at the top of a shop. In order of preference:
 * 1. the seller's own banner photo;
 * 2. a strip of the shop's own product photos (real food or clothes beat any pattern);
 * 3. gbam green saying paying here is safe: the thing a new customer worries about most.
 */
export function ShopBanner({
  businessName,
  bannerUrl,
  photoUrls = [],
}: {
  businessName: string;
  bannerUrl: string | null;
  /** The shop's product photos, used when there's no banner. */
  photoUrls?: string[];
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

  const photos = photoUrls.slice(0, MAX_BANNER_PHOTOS);
  if (photos.length > 0) {
    return (
      <div
        data-testid="photo-banner"
        aria-hidden="true"
        className="bg-blush flex aspect-[3/1] w-full gap-1 overflow-hidden rounded-2xl"
      >
        {photos.map((url) => (
          <img key={url} src={url} alt="" className="h-full min-w-0 flex-1 object-cover" />
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="default-banner"
      className="bg-brand relative flex aspect-[3/1] w-full flex-col items-center justify-center overflow-hidden rounded-2xl px-4 text-center text-white"
    >
      {/* Soft gbam-coloured circles behind the words. */}
      <span
        aria-hidden="true"
        className="bg-brand-hover absolute -top-10 -left-10 size-48 rounded-full opacity-60"
      />
      <span
        aria-hidden="true"
        className="bg-coral absolute -right-8 -bottom-16 size-56 rounded-full opacity-40"
      />
      <p className="font-display relative text-lg font-black sm:text-2xl">
        Order here, pay safely
      </p>
      <p className="relative mt-1 text-xs text-white/85 sm:text-sm">Secured by Paystack</p>
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
  photoUrls = [],
  children,
}: {
  businessName: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  /** The shop's product photos: the banner shows them when the seller hasn't added one. */
  photoUrls?: string[];
  /** A line or two under the name. */
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      <ShopBanner businessName={businessName} bannerUrl={bannerUrl} photoUrls={photoUrls} />
      {/* relative z-10: the default banner is positioned (for its circles), which would
          otherwise paint over the logo where the two overlap. */}
      <div className="relative z-10 -mt-10 flex items-end gap-4 px-4 sm:-mt-12">
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
