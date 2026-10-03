import Markdown from "react-markdown";

// Renders Markdown with the brand's reading styles. `skipHtml` drops any raw HTML in the
// source (so a <script> in content can never reach the page).
export function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="text-ink-muted max-w-prose text-base leading-7 [&_a]:text-brand [&_a]:underline [&_h1]:font-display [&_h1]:text-ink [&_h1]:mb-4 [&_h1]:text-4xl [&_h1]:font-black [&_h2]:font-display [&_h2]:text-ink [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:text-ink [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-bold [&_li]:mb-1 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-4 [&_strong]:text-ink [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6">
      <Markdown skipHtml>{markdown}</Markdown>
    </div>
  );
}
