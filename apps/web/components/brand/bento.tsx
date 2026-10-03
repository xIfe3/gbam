const tints = {
  white: "bg-white text-ink",
  brand: "bg-brand text-white",
  coral: "bg-coral-tint text-ink",
};

const eyebrowColors = {
  white: "text-brand",
  brand: "text-brand-tint",
  coral: "text-coral-deep",
};

// A responsive grid of tiles: one column on phones, two from the sm breakpoint.
export function BentoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

type BentoTileProps = {
  eyebrow?: string;
  title: string;
  tint?: "white" | "brand" | "coral";
  // span 2 makes the tile fill the whole row from sm upwards.
  span?: 1 | 2;
  children?: React.ReactNode;
};

export function BentoTile({ eyebrow, title, tint = "white", span = 1, children }: BentoTileProps) {
  let spanClass = "";
  if (span === 2) {
    spanClass = "sm:col-span-2";
  }

  return (
    <section className={`rounded-3xl p-6 ${tints[tint]} ${spanClass}`}>
      {eyebrow && (
        <p className={`mb-2 text-xs font-bold tracking-widest uppercase ${eyebrowColors[tint]}`}>
          {eyebrow}
        </p>
      )}
      <h3 className="font-display text-2xl leading-tight font-black">{title}</h3>
      {children && <div className="mt-3 text-base leading-relaxed opacity-90">{children}</div>}
    </section>
  );
}
