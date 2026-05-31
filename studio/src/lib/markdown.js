/**
 * Minimal inline markdown renderer, byte-for-byte mirror of the server
 * `renderInlineMarkdown` in src/workspace/entity-panel.ts: escape everything,
 * then re-enable **bold** and *italic* runs only. Everything else stays escaped
 * text — safe to inject via {@html}.
 */

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value ?? "").replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

export function renderInlineMarkdown(markdown) {
  const escaped = escapeHtml(String(markdown ?? "").trim());
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
}
