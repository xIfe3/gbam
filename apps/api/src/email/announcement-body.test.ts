import { describe, expect, it } from "vitest";
import { renderBody } from "./announcement-body.js";

describe("announcement body", () => {
  it("paragraphs, bold, links and lists", () => {
    const body = [
      "Hello **sellers**,",
      "",
      "Delivery zones are here. Read [the guide](https://gbam.app/help/delivery).",
      "",
      "- Set a fee per area",
      "- Offer pickup",
    ].join("\n");
    const { html, text } = renderBody(body);
    expect(html).toMatch(/<strong[^>]*>sellers<\/strong>/);
    expect(html).toContain('<a href="https://gbam.app/help/delivery"');
    expect(html).toContain(">the guide</a>");
    expect(html).toContain("<li");
    expect(html).toContain("Set a fee per area</li>");
    expect(text).toContain("Hello sellers,");
    expect(text).toContain("the guide (https://gbam.app/help/delivery)");
    expect(text).toContain("- Offer pickup");
  });

  it("body formatting is escaped and limited", () => {
    const body = 'Hi <script>alert(1)</script> and [click](javascript:alert(1)) & "quotes"';
    const { html } = renderBody(body);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    // Only https links become links; anything else stays as plain text.
    expect(html).not.toContain('href="javascript');
    expect(html).toContain("[click](javascript:alert(1))");
    expect(html).toContain("&amp; &quot;quotes&quot;");
  });

  it("line breaks inside a paragraph are kept", () => {
    const { html } = renderBody("Line one\nLine two");
    expect(html).toContain("Line one<br>Line two");
  });
});
