type LegalTocProps = {
  items: { id: string; heading: string }[];
};

// The "On this page" list at the top of a legal document; each link jumps to a section.
export function LegalToc({ items }: LegalTocProps) {
  const links = [];
  for (const item of items) {
    links.push(
      <li key={item.id}>
        <a
          href={`#${item.id}`}
          className="text-brand focus-visible:outline-brand inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {item.heading}
        </a>
      </li>,
    );
  }

  return (
    <nav aria-label="On this page" className="rounded-2xl bg-white p-5">
      <p className="text-ink text-sm font-bold">On this page</p>
      <ul className="mt-2 text-sm">{links}</ul>
    </nav>
  );
}
