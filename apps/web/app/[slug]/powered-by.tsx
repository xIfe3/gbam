import Link from "next/link";

/**
 * "Powered by Gbam." in a shop's footer. The link is tagged with the shop
 * (/?ref=shop-<slug>), so a visitor who clicks it and signs up is counted for that shop:
 * the cheapest way sellers find gbam is by buying from one.
 */
export function PoweredByGbam({ shopSlug }: { shopSlug: string }) {
  return (
    <>
      Powered by{" "}
      <Link
        href={`/?ref=shop-${shopSlug}`}
        className="font-display text-brand font-black underline-offset-2 hover:underline"
      >
        Gbam.
      </Link>
    </>
  );
}
