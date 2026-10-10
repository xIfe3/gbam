import type { Metadata } from "next";
import { BentoGrid, BentoTile } from "@/components/brand/bento";
import { CtaBand } from "@/components/brand/cta-band";
import { PageHeader } from "@/components/brand/page-header";
import { getMarketing, headerCta } from "@/lib/marketing";

/** The description comes from Admin → Content → Marketing pages (today's text until edited). */
export async function generateMetadata(): Promise<Metadata> {
  const fields = await getMarketing("features");
  return { title: "Features", description: fields.seoDescription };
}

/**
 * Each tile's look, by position: the words come from the editable fields, the layout stays
 * here so an edit can't break the grid. Tiles past the end of this list get the plain look.
 */
const TILE_LAYOUT: { tint?: "brand" | "coral"; span?: 2 }[] = [
  { tint: "brand", span: 2 },
  {},
  { tint: "coral" },
  {},
  {},
  { span: 2 },
  { tint: "coral" },
  {},
  {},
  { tint: "brand" },
];

export default async function FeaturesPage() {
  const fields = await getMarketing("features");
  const header = fields.header;
  return (
    <>
      <PageHeader
        eyebrow={header.eyebrow}
        title={header.title}
        lead={header.lead}
        photo={{
          description: "seller checking orders on her phone at her stall",
          src: header.photoSrc,
          alt: header.photoAlt,
        }}
        cta={headerCta(header, "/signup")}
      />
      <div className="mx-auto max-w-5xl px-4">
        <BentoGrid>
          {fields.tiles.map((tile, index) => {
            let layout: { tint?: "brand" | "coral"; span?: 2 } = {};
            const fixed = TILE_LAYOUT[index];
            if (fixed) {
              layout = fixed;
            }
            return (
              <BentoTile
                key={index}
                eyebrow={tile.eyebrow}
                title={tile.title}
                tint={layout.tint}
                span={layout.span}
              >
                {tile.text}
              </BentoTile>
            );
          })}
        </BentoGrid>
      </div>
      <CtaBand />
    </>
  );
}
