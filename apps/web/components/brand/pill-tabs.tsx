import Link from "next/link";

type PillTabsProps = {
  items: { href: string; label: string }[];
  activeHref: string;
  // Accessible name of the nav landmark.
  label?: string;
};

// Pill-shaped links for switching between sibling pages (e.g. the legal documents).
export function PillTabs({ items, activeHref, label = "Sections" }: PillTabsProps) {
  const links = [];
  for (const item of items) {
    let classes = "bg-white text-ink-muted hover:bg-brand-tint";
    let current: "page" | undefined = undefined;
    if (item.href === activeHref) {
      classes = "bg-brand text-white font-bold";
      current = "page";
    }
    links.push(
      <Link
        key={item.href}
        href={item.href}
        aria-current={current}
        className={`focus-visible:outline-brand inline-flex min-h-11 items-center rounded-full px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${classes}`}
      >
        {item.label}
      </Link>,
    );
  }

  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {links}
    </nav>
  );
}
