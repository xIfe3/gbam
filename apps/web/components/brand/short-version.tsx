// The green plain-language summary shown beside a section of a legal document.
export function ShortVersion({ children }: { children: React.ReactNode }) {
  return (
    <aside className="bg-brand-tint text-ink rounded-xl p-3 text-sm leading-snug">
      <b>Short version:</b> {children}
    </aside>
  );
}
