export type NavLink = { href: string; label: string };
export type NavGroup = { title: string; links: NavLink[] };

// Legal documents served by /legal/[doc], in the order they are listed.
export const LEGAL_DOCS = [
  "terms",
  "privacy",
  "cookies",
  "refunds",
  "seller-agreement",
  "acceptable-use",
  "data-deletion",
] as const;

export const LEGAL_LABELS: Record<(typeof LEGAL_DOCS)[number], string> = {
  terms: "Terms",
  privacy: "Privacy",
  cookies: "Cookies",
  refunds: "Refunds",
  "seller-agreement": "Seller Agreement",
  "acceptable-use": "Acceptable Use",
  "data-deletion": "Data Deletion",
};

export const HEADER_LINKS: NavLink[] = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
];

export const LOGIN_LINK: NavLink = { href: "/login", label: "Log in" };
export const SIGNUP_LINK: NavLink = { href: "/signup", label: "Start free" };

const legalLinks: NavLink[] = [];
for (const doc of LEGAL_DOCS) {
  legalLinks.push({ href: `/legal/${doc}`, label: LEGAL_LABELS[doc] });
}

export const FOOTER_GROUPS: NavGroup[] = [
  {
    title: "Product",
    links: [
      { href: "/", label: "Home" },
      { href: "/features", label: "Features" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/use-cases", label: "Use cases" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/mission", label: "Mission" },
      { href: "/security", label: "Security" },
      { href: "/blog", label: "Blog" },
      { href: "/changelog", label: "Changelog" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/help", label: "Help centre" },
      { href: "/track", label: "Track an order" },
      { href: "/faq", label: "FAQ" },
      { href: "/login", label: "Log in" },
      { href: "/signup", label: "Sign up" },
    ],
  },
  { title: "Legal", links: legalLinks },
];
