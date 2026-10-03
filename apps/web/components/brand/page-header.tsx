import { Button } from "./button";
import { Photo } from "./photo";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  lead: string;
  photo: { description: string; src?: string };
  cta?: { href: string; label: string };
};

// The split header used by content pages: text on one side, a photo slot on the other
// (stacked on phones).
export function PageHeader({ eyebrow, title, lead, photo, cta }: PageHeaderProps) {
  return (
    <header className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-12 md:grid-cols-2">
      <div>
        <p className="text-coral-deep mb-3 text-xs font-bold tracking-widest uppercase">
          {eyebrow}
        </p>
        <h1 className="font-display text-ink text-4xl leading-none font-black sm:text-5xl">
          {title}
        </h1>
        <p className="text-ink-muted mt-4 max-w-md text-lg leading-relaxed">{lead}</p>
        {cta && (
          <div className="mt-6">
            <Button href={cta.href} variant="primary" size="lg">
              {cta.label}
            </Button>
          </div>
        )}
      </div>
      <Photo description={photo.description} src={photo.src} className="h-64 w-full md:h-80" />
    </header>
  );
}
