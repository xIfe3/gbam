import Link from "next/link";
import { FOOTER_GROUPS } from "@/lib/site-nav";
import { Logo } from "./logo";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-5">
        <div className="md:col-span-1">
          <Logo variant="on-dark" size="md" />
        </div>
        {FOOTER_GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="mb-3 text-sm font-bold">{group.title}</h2>
            <ul className="flex flex-col">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-brand-tint inline-flex min-h-11 items-center text-sm hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="text-brand-tint border-t border-white/15 px-4 py-6 text-center text-sm">
        © {year} Gbam · A product of Zephra Studios
      </p>
    </footer>
  );
}
