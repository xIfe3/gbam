"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HEADER_LINKS, LOGIN_LINK, SIGNUP_LINK } from "@/lib/site-nav";
import { Button } from "./button";
import { Logo } from "./logo";

const linkClasses =
  "text-ink-muted hover:text-brand inline-flex min-h-11 items-center px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-blush relative">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          aria-label="Gbam home"
          className="focus-visible:outline-brand inline-flex min-h-11 items-center focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Logo size="sm" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {HEADER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClasses}>
              {link.label}
            </Link>
          ))}
          <Link href={LOGIN_LINK.href} className={linkClasses}>
            {LOGIN_LINK.label}
          </Link>
          <Button href={SIGNUP_LINK.href} variant="primary">
            {SIGNUP_LINK.label}
          </Button>
        </nav>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="text-ink focus-visible:outline-brand flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 md:hidden"
        >
          {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="bg-blush border-brand-tint flex flex-col gap-1 border-t px-4 py-3 md:hidden"
        >
          {HEADER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClasses}>
              {link.label}
            </Link>
          ))}
          <Link href={LOGIN_LINK.href} className={linkClasses}>
            {LOGIN_LINK.label}
          </Link>
          <div className="pt-2">
            <Button href={SIGNUP_LINK.href} variant="primary">
              {SIGNUP_LINK.label}
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
