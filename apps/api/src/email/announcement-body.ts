/*
 * The simple formatting admins can use in an announcement:
 *
 *   A blank line starts a new paragraph.
 *   **bold**
 *   [link text](https://example.com)   (https links only)
 *   - a list item                       (every line of the block starts with "- ")
 *
 * Everything is escaped first, so any other HTML someone types shows as plain text.
 */

// Same colours as the email layout in templates.ts (emails need inline styles).
const INK = "#132a20";
const INK_MUTED = "#3b4b43";
const BRAND = "#13804f";

const PARAGRAPH_STYLE = `margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: ${INK_MUTED}`;
const LIST_STYLE = `margin: 0 0 16px; padding-left: 20px; font-size: 16px; line-height: 1.6; color: ${INK_MUTED}`;

// **bold**: the shortest text between two pairs of stars.
const BOLD = /\*\*(.+?)\*\*/g;
// [text](https://...): only https links; anything else is left as it was typed.
const LINK = /\[([^\]\n]+)\]\((https:\/\/[^\s)]+)\)/g;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** One line, with **bold** and links turned into HTML. Escaped before anything else. */
function inlineHtml(line: string): string {
  const escaped = escapeHtml(line);
  const bold = escaped.replace(BOLD, `<strong style="color: ${INK}">$1</strong>`);
  // $1 is the link text, $2 the address (both already escaped above).
  return bold.replace(LINK, `<a href="$2" style="color: ${BRAND}; font-weight: bold">$1</a>`);
}

/** The same line for the plain-text version: no stars, links written as "text (address)". */
function inlineText(line: string): string {
  const noBold = line.replace(BOLD, "$1");
  return noBold.replace(LINK, "$1 ($2)");
}

function isListBlock(lines: string[]): boolean {
  for (const line of lines) {
    if (!line.startsWith("- ")) {
      return false;
    }
  }
  return true;
}

/** The announcement's body as HTML (for the branded layout) and as plain text. */
export function renderBody(body: string): { html: string; text: string } {
  const normalised = body.replaceAll("\r\n", "\n").trim();
  // Blocks are separated by one or more blank lines.
  const blocks = normalised.split(/\n\s*\n/);
  const htmlParts: string[] = [];
  const textParts: string[] = [];

  for (const block of blocks) {
    const lines: string[] = [];
    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (trimmed !== "") {
        lines.push(trimmed);
      }
    }
    if (lines.length === 0) {
      continue;
    }

    if (isListBlock(lines)) {
      const items: string[] = [];
      const textItems: string[] = [];
      for (const line of lines) {
        const item = line.slice(2);
        items.push(`<li style="margin: 0 0 4px">${inlineHtml(item)}</li>`);
        textItems.push(`- ${inlineText(item)}`);
      }
      htmlParts.push(`<ul style="${LIST_STYLE}">${items.join("")}</ul>`);
      textParts.push(textItems.join("\n"));
    } else {
      const htmlLines: string[] = [];
      const textLines: string[] = [];
      for (const line of lines) {
        htmlLines.push(inlineHtml(line));
        textLines.push(inlineText(line));
      }
      htmlParts.push(`<p style="${PARAGRAPH_STYLE}">${htmlLines.join("<br>")}</p>`);
      textParts.push(textLines.join("\n"));
    }
  }

  return { html: htmlParts.join("\n"), text: textParts.join("\n\n") };
}
