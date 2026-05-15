import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "s",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "hr",
  "a",
  "img",
];

const ALLOWED_ATTR = ["href", "src", "alt", "class"];

function hardenAnchors(html: string): string {
  if (!html.includes("<a")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const a of Array.from(doc.body.querySelectorAll("a"))) {
    a.setAttribute("rel", "noopener noreferrer");
    a.setAttribute("target", "_blank");
  }
  return doc.body.innerHTML;
}

export function sanitizeCommentHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
  return hardenAnchors(sanitized);
}

export function hasRenderableSanitizedHtml(sanitized: string): boolean {
  const doc = new DOMParser().parseFromString(sanitized, "text/html");
  if ((doc.body.textContent ?? "").trim().length > 0) return true;
  return doc.body.querySelector("img") !== null;
}
