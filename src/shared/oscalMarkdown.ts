/**
 * OSCAL markup rendering — safe rendering of markup-line (inline) and markup-multiline
 * (block+inline) content. Decision IDs: ADR-0009.
 *
 * Security model: (1) HTML-escape all input first, so any raw HTML becomes inert text;
 * (2) apply a fixed markdown subset via regex; (3) allowlist link URLs. No raw HTML
 * passthrough, no images.
 *
 * Supported subset: bold (**x**), italic (*x*), code (`x`), links ([t](url)),
 * subscript (~x~), superscript (^x^).
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]!);
}

/** Allow only http(s) and app-relative (/ or #) URLs; reject javascript:, data:, etc. */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
  return /^https?:\/\//i.test(trimmed);
}

// Link text may itself contain inline formatting; disallow nested brackets to avoid
// ambiguous matches.
const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;
const CODE_RE = /`([^`]+)`/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const ITALIC_RE = /\*([^*]+)\*/g;
const SUB_RE = /~([^~]+)~/g;
const SUP_RE = /\^([^^]+)\^/g;

function applyNonCode(segment: string): string {
  let html = segment;
  html = html.replace(LINK_RE, (_match, text: string, url: string) => {
    // url is HTML-escaped already; validate against the raw (unescaped) intent.
    const rawUrl = url.replace(/&amp;/g, '&');
    if (!isSafeUrl(rawUrl)) return text; // drop unsafe link, keep its text
    return `<a href="${url}" rel="noopener noreferrer">${text}</a>`;
  });
  html = html.replace(BOLD_RE, '<strong>$1</strong>');
  html = html.replace(ITALIC_RE, '<em>$1</em>');
  html = html.replace(SUB_RE, '<sub>$1</sub>');
  html = html.replace(SUP_RE, '<sup>$1</sup>');
  return html;
}

function applyInline(escaped: string): string {
  // Split into code spans and the rest; code content is emitted verbatim (already escaped)
  // and is never re-interpreted as other markdown.
  return escaped
    .split(/(`[^`]+`)/g)
    .map((part) => {
      const code = /^`([^`]+)`$/.exec(part);
      return code ? `<code>${code[1]}</code>` : applyNonCode(part);
    })
    .join('');
}

/** Render OSCAL markup-line to safe inline HTML. */
export function renderInlineMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  return applyInline(escapeHtml(text));
}

/** Render OSCAL markup-multiline to safe block HTML (paragraphs split on blank lines). */
export function renderMultilineMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  const escaped = escapeHtml(text);
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${applyInline(p.replace(/\n/g, '<br>'))}</p>`);
  return paragraphs.join('');
}

/** Strip markdown markers to plain text (for titles, search indexing). */
export function stripMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(LINK_RE, '$1')
    .replace(CODE_RE, '$1')
    .replace(BOLD_RE, '$1')
    .replace(ITALIC_RE, '$1')
    .replace(SUB_RE, '$1')
    .replace(SUP_RE, '$1');
}
