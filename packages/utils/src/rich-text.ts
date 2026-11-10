/**
 * Rich-text helpers for product descriptions.
 *
 * Descriptions may be plain text OR rich-text HTML authored through the admin
 * toolbar. Everything the API stores passes through `sanitizeRichText`, and the
 * storefront re-sanitises before rendering, so the two sides agree on one
 * allowlist with zero dependencies (no DOM, no jsdom — API runs on Node).
 */

/** Tags a product description may keep. Everything else is dropped. */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
]);

/** Void elements we keep but never balance/close. */
const VOID_TAGS = new Set(["br"]);

/** Tags whose entire content must disappear (not just the tags themselves). */
const DROP_WITH_CONTENT = ["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math"];

interface Token {
  kind: "text" | "open" | "close";
  /** for open/close: lowercased tag name */
  tag: string;
  /** for open: rebuilt attributes string (safe) */
  attrs: string;
  raw: string;
}

/** Only http(s), mailto and same-relative URLs are allowed in href. */
function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^(https?:\/\/|mailto:|\/(?!\/))/i.test(trimmed)) return trimmed;
  return null;
}

/** Rebuild the attribute string for a kept tag, dropping everything unsafe. */
function safeAttrs(tag: string, attrSource: string): string {
  if (tag !== "a") return ""; // every other allowed tag carries no attributes
  const hrefMatch = attrSource.match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const href = hrefMatch ? safeHref(hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? "") : null;
  if (!href) return "";
  // Links open safely — never inherit the referring page's trust.
  return ` href="${href.replace(/"/g, "%22")}" rel="noopener nofollow" target="_blank"`;
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const dropRe = new RegExp(`<(${DROP_WITH_CONTENT.join("|")})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi");
  // Replace drop-with-content blocks with a placeholder comment that the tag
  // regex below will never match, so their inner markup disappears entirely.
  let scrubbed = html.replace(dropRe, "");
  scrubbed = scrubbed.replace(/<!--[\s\S]*?-->/g, ""); // comments never survive

  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^"'>])*)(\/?)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(scrubbed)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: "text", tag: "", attrs: "", raw: scrubbed.slice(lastIndex, match.index) });
    }
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? "";
    const selfClosed = match[3] === "/";
    if (match[0].startsWith("</")) {
      tokens.push({ kind: "close", tag, attrs: "", raw: match[0] });
    } else {
      tokens.push({ kind: "open", tag, attrs: selfClosed ? "" : safeAttrs(tag, attrs), raw: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < scrubbed.length) {
    tokens.push({ kind: "text", tag: "", attrs: "", raw: scrubbed.slice(lastIndex) });
  }
  return tokens;
}

/**
 * Sanitise rich-text HTML from the admin editor:
 * - script/style/iframe/… blocks (and their content) are removed entirely
 * - comments are removed
 * - tags outside the allowlist are dropped (their text content is kept)
 * - `<a>` keeps only a safe href; every other attribute (class, style, on-event handlers) is stripped
 * - output is tag-balanced so a stray `</p>` can never break page layout
 */
export function sanitizeRichText(html: string): string {
  if (!html) return "";
  const tokens = tokenize(html);
  const out: string[] = [];
  const stack: string[] = [];

  for (const token of tokens) {
    if (token.kind === "text") {
      out.push(token.raw);
      continue;
    }
    if (token.kind === "open") {
      if (!ALLOWED_TAGS.has(token.tag)) continue; // drop the tag, keep surrounding text
      if (VOID_TAGS.has(token.tag)) {
        out.push("<br>");
        continue;
      }
      out.push(`<${token.tag}${token.attrs}>`);
      stack.push(token.tag);
      continue;
    }
    // close
    if (!ALLOWED_TAGS.has(token.tag) || VOID_TAGS.has(token.tag)) continue;
    const openIdx = stack.lastIndexOf(token.tag);
    if (openIdx === -1) continue; // stray closer — drop it
    // close any tags opened after it (auto-balance), then the tag itself
    for (let i = stack.length - 1; i >= openIdx; i--) {
      out.push(`</${stack[i]}>`);
    }
    stack.length = openIdx;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    out.push(`</${stack[i]}>`);
  }
  return out.join("").trim();
}

/**
 * Plain-text view of a description: HTML tags removed, common entities decoded,
 * whitespace collapsed. Used for search haystacks, length validation and meta
 * descriptions so markup never leaks into those contexts.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  const withoutBlocks = html
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = withoutBlocks
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|h3|h4|li|blockquote|div)>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a description looks like rich-text HTML rather than legacy plain text. */
export function looksLikeHtml(text: string): boolean {
  return /<\/?(p|br|strong|b|em|i|u|s|h3|h4|ul|ol|li|blockquote|a|div|span|h1|h2|h5|h6|img|script)\b/i.test(text);
}
