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
    <nav aria-label="On this page" className="bg-white rounded-2xl p-5">
      <p className="text-ink text-sm font-bold">On this page</p>
      <ol className="mt-2 list-decimal pl-5 text-sm">{links}</ol>
    </nav>
  );
}
