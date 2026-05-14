import { describe, it, expect } from "vitest";
import { sanitizeCommentHtml } from "./sanitize";

describe("sanitizeCommentHtml", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeCommentHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain("<p>hi</p>");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("removes inline event handlers like onerror", () => {
    const out = sanitizeCommentHtml('<img src="x" onerror="alert(1)">');
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toContain("alert(1)");
  });

  it("neutralizes javascript: URLs on anchor tags", () => {
    const out = sanitizeCommentHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it("removes disallowed tags such as <iframe>", () => {
    const out = sanitizeCommentHtml('<iframe src="https://evil.example"></iframe>');
    expect(out.toLowerCase()).not.toContain("<iframe");
  });

  it("preserves legitimate Tiptap formatting", () => {
    const out = sanitizeCommentHtml(
      '<p><strong>hello</strong> <em>world</em></p><ul><li>a</li><li>b</li></ul>',
    );
    expect(out).toContain("<strong>hello</strong>");
    expect(out).toContain("<em>world</em>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>a</li>");
  });

  it("keeps safe external links and forces rel/target attributes", () => {
    const out = sanitizeCommentHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toMatch(/rel="noopener noreferrer"/);
    expect(out).toMatch(/target="_blank"/);
  });

  it("keeps safe images", () => {
    const out = sanitizeCommentHtml(
      '<img src="https://example.com/x.png" alt="x">',
    );
    expect(out).toContain('src="https://example.com/x.png"');
    expect(out).toContain('alt="x"');
  });
});
