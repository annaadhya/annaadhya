import { describe, expect, it } from "vitest";
import { looksLikeHtml, sanitizeRichText, stripHtml } from "../src/rich-text";

describe("sanitizeRichText", () => {
  it("keeps allowed formatting tags intact", () => {
    const html = "<p><strong>Wild</strong> forest <em>honey</em></p>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("keeps headings, lists and blockquotes", () => {
    const html = "<h3>Notes</h3><ul><li>Raw</li><li>Unheated</li></ul><blockquote>Small batch</blockquote>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("removes script/style content entirely", () => {
    const out = sanitizeRichText('<p>Fine</p><script>alert("x")</script><style>.a{}</style>');
    expect(out).toBe("<p>Fine</p>");
    expect(out).not.toContain("alert");
  });

  it("strips event handlers and style attributes from kept tags", () => {
    const out = sanitizeRichText('<p onclick="evil()" style="position:fixed">Safe</p>');
    expect(out).toBe("<p>Safe</p>");
  });

  it("drops disallowed tags but keeps their text", () => {
    const out = sanitizeRichText("<p>A</p><table><tr><td>B</td></tr></table><p>C</p>");
    expect(out).toContain("A");
    expect(out).toContain("B");
    expect(out).toContain("C");
    expect(out).not.toContain("<table");
    expect(out).not.toContain("<td");
  });

  it("keeps only safe http(s)/mailto/relative hrefs on anchors", () => {
    expect(sanitizeRichText('<a href="https://annaadhya.in">Shop</a>')).toBe(
      '<a href="https://annaadhya.in" rel="noopener nofollow" target="_blank">Shop</a>',
    );
    // unsafe hrefs are stripped but the anchor text survives (renders as inert text)
    expect(sanitizeRichText('<a href="javascript:alert(1)">Bad</a>')).toBe("<a>Bad</a>");
    expect(sanitizeRichText('<a href="/shop">Internal</a>')).toContain('href="/shop"');
    expect(sanitizeRichText('<a href="mailto:care@annaadhya.in">Mail</a>')).toContain("mailto:care@annaadhya.in");
  });

  it("strips onerror loaded via attribute injection", () => {
    const out = sanitizeRichText('<img src=x onerror="alert(1)"><p>ok</p>');
    expect(out).toBe("<p>ok</p>");
    expect(out).not.toContain("onerror");
  });

  it("balances unclosed tags", () => {
    expect(sanitizeRichText("<p><strong>unbalanced")).toBe("<p><strong>unbalanced</strong></p>");
  });

  it("drops stray closing tags", () => {
    expect(sanitizeRichText("</p>stray<p>kept</p>")).toBe("stray<p>kept</p>");
  });

  it("removes html comments", () => {
    expect(sanitizeRichText("before<!-- hidden -->after")).toBe("beforeafter");
  });

  it("passes legacy plain text through untouched", () => {
    const plain = "Line one\n\nLine two with 100% natural honey.";
    expect(sanitizeRichText(plain)).toBe(plain);
  });
});

describe("stripHtml", () => {
  it("removes tags and decodes entities", () => {
    expect(stripHtml("<p>Honey &amp; spice — <strong>pure</strong></p>")).toBe("Honey & spice — pure");
  });

  it("inserts breaks at block boundaries so words do not fuse", () => {
    const out = stripHtml("<p>First</p><p>Second</p>");
    expect(out).toBe("First Second");
  });

  it("drops script content", () => {
    expect(stripHtml("a<script>bad()</script>b")).toBe("a b");
  });

  it("collapses whitespace", () => {
    expect(stripHtml("<p>a</p>\n\n  <p>b</p>")).toBe("a b");
  });
});

describe("looksLikeHtml", () => {
  it("detects rich text", () => {
    expect(looksLikeHtml("<p>hello</p>")).toBe(true);
    expect(looksLikeHtml("plain text")).toBe(false);
    expect(looksLikeHtml("a < b and c > d")).toBe(false);
  });
});
