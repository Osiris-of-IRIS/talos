/**
 * OSCAL markup rendering — safe rendering of markup-line (inline) and markup-multiline
 * (block+inline) content. Decision IDs: ADR-0009, ADR-0030.
 *
 * Security model: (1) HTML-escape all input first, so any raw HTML becomes inert text;
 * (2) apply a fixed markdown subset via regex/line-based parsing; (3) allowlist link URLs.
 * No raw HTML passthrough, no images (ADR-0030 keeps ADR-0009's no-images stance even though
 * the metaschema datatype spec lists them).
 *
 * Supported subset (ADR-0030, mirrors metaschema markup-line/markup-multiline):
 * inline — bold (**x**), italic (*x*), code (`x`), links ([t](url)), subscript (~x~),
 * superscript (^x^), specialized-character escaping (\*, \`, \~, \^), parameter insertion
 * ({{ insert: param, id }} → an unresolved placeholder chip; no params context here — resolved
 * display for catalog control statements stays in models/controlDisplay.ts, ADR-0016).
 * block (multiline only) — paragraphs, line feeds (single \n → <br>), headings (# – ######),
 * lists (ordered/unordered, nested by indentation), fenced code blocks, blockquotes, tables
 * (pipe syntax + column alignment).
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
const INSERT_RE = /\{\{\s*insert:\s*param\s*,\s*([^}\s]+)\s*\}\}/g;

// Specialized character mapping (ADR-0030): a backslash-escaped markup-significant character
// renders literally instead of triggering formatting. Protected as sentinel tokens before
// code-span/formatting regexes run, restored to the literal character at the very end — the
// tokens contain only NUL + ASCII letters/digits so they can never collide with real content or
// be re-interpreted as markup themselves.
const ESCAPABLE: [RegExp, string, string][] = [
  [/\\\*/g, ' ESC0 ', '*'],
  [/\\`/g, ' ESC1 ', '`'],
  [/\\~/g, ' ESC2 ', '~'],
  [/\\\^/g, ' ESC3 ', '^'],
];

function protectEscapes(text: string): string {
  let out = text;
  for (const [re, token] of ESCAPABLE) out = out.replace(re, token);
  return out;
}

function restoreEscapes(text: string): string {
  let out = text;
  for (const [, token, literal] of ESCAPABLE) out = out.replaceAll(token, literal);
  return out;
}

function applyNonCode(segment: string): string {
  let html = segment;
  html = html.replace(INSERT_RE, (_match, id: string) => `<span class="markup-param-insert">‹ ${id} ›</span>`);
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
  const protectedText = protectEscapes(escaped);
  const rendered = protectedText
    .split(/(`[^`]+`)/g)
    .map((part) => {
      const code = /^`([^`]+)`$/.exec(part);
      return code ? `<code>${code[1]}</code>` : applyNonCode(part);
    })
    .join('');
  return restoreEscapes(rendered);
}

/** Render OSCAL markup-line to safe inline HTML. */
export function renderInlineMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  return applyInline(escapeHtml(text));
}

// ---------------------------------------------------------------------------------------------
// Block-level parsing (markup-multiline only). Operates on the already HTML-escaped text, so
// none of the classifier regexes below need to worry about raw HTML — escapeHtml only touches
// &<>"' and leaves every markdown-structural character (#, -, digits+., >, |, backtick) alone.

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_ITEM_RE = /^(\s*)[-*+]\s+(.*)$/;
const OL_ITEM_RE = /^(\s*)\d+\.\s+(.*)$/;
const FENCE_RE = /^\s*```/;
// escapeHtml already ran, so a source '>' is now the entity '&gt;' by the time this matches.
const BLOCKQUOTE_RE = /^&gt;\s?(.*)$/;

function isListLine(line: string): boolean {
  return UL_ITEM_RE.test(line) || OL_ITEM_RE.test(line);
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function isTableSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  const cells = splitTableCells(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

type Align = 'left' | 'center' | 'right' | null;

function parseAligns(sepLine: string): Align[] {
  return splitTableCells(sepLine).map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return null; // 'left' is the (unmarked) default — no style attribute needed
  });
}

function alignAttr(align: Align): string {
  return align ? ` style="text-align:${align}"` : '';
}

function renderTable(headerLine: string, sepLine: string, bodyLines: string[]): string {
  const header = splitTableCells(headerLine);
  const aligns = parseAligns(sepLine);
  const th = header.map((c, idx) => `<th${alignAttr(aligns[idx] ?? null)}>${applyInline(c)}</th>`).join('');
  const bodyRows = bodyLines
    .map((line) => {
      const cells = splitTableCells(line);
      return `<tr>${cells.map((c, idx) => `<td${alignAttr(aligns[idx] ?? null)}>${applyInline(c)}</td>`).join('')}</tr>`;
    })
    .join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

interface ListLine {
  indent: number;
  ordered: boolean;
  content: string;
}

function toListLine(line: string): ListLine | null {
  const ul = UL_ITEM_RE.exec(line);
  if (ul) return { indent: ul[1]!.length, ordered: false, content: ul[2]! };
  const ol = OL_ITEM_RE.exec(line);
  if (ol) return { indent: ol[1]!.length, ordered: true, content: ol[2]! };
  return null;
}

/** Recursive-descent list renderer: a deeper-indented run of items nests under the preceding item. */
function renderListItems(lines: ListLine[], pos: { i: number }, indent: number): string {
  const groups: { ordered: boolean; items: string[] }[] = [];
  while (pos.i < lines.length) {
    const line = lines[pos.i]!;
    if (line.indent < indent) break;
    if (groups.length === 0 || groups[groups.length - 1]!.ordered !== line.ordered) {
      groups.push({ ordered: line.ordered, items: [] });
    }
    let itemHtml = applyInline(line.content);
    pos.i++;
    if (pos.i < lines.length && lines[pos.i]!.indent > indent) {
      itemHtml += renderListItems(lines, pos, lines[pos.i]!.indent);
    }
    groups[groups.length - 1]!.items.push(`<li>${itemHtml}</li>`);
  }
  return groups.map((g) => (g.ordered ? `<ol>${g.items.join('')}</ol>` : `<ul>${g.items.join('')}</ul>`)).join('');
}

function renderList(rawLines: string[]): string {
  const lines = rawLines.map(toListLine).filter((l): l is ListLine => l !== null);
  if (lines.length === 0) return '';
  const pos = { i: 0 };
  return renderListItems(lines, pos, lines[0]!.indent);
}

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.trim() === '') {
      i++;
      continue;
    }

    if (FENCE_RE.test(lines[i]!)) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !FENCE_RE.test(lines[i]!)) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip the closing fence (tolerate a missing one — loop condition already ended it)
      out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    const heading = HEADING_RE.exec(lines[i]!);
    if (heading) {
      const level = heading[1]!.length;
      out.push(`<h${level}>${applyInline(heading[2]!.trim())}</h${level}>`);
      i++;
      continue;
    }

    if (BLOCKQUOTE_RE.test(lines[i]!)) {
      const bqLines: string[] = [];
      while (i < lines.length && BLOCKQUOTE_RE.test(lines[i]!)) {
        bqLines.push(lines[i]!.replace(BLOCKQUOTE_RE, '$1'));
        i++;
      }
      out.push(`<blockquote>${renderBlocks(bqLines)}</blockquote>`);
      continue;
    }

    if (lines[i]!.includes('|') && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1]!)) {
      const headerLine = lines[i]!;
      const sepLine = lines[i + 1]!;
      i += 2;
      const bodyLines: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== '' && lines[i]!.includes('|')) {
        bodyLines.push(lines[i]!);
        i++;
      }
      out.push(renderTable(headerLine, sepLine, bodyLines));
      continue;
    }

    if (isListLine(lines[i]!)) {
      const listLines: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== '' && isListLine(lines[i]!)) {
        listLines.push(lines[i]!);
        i++;
      }
      out.push(renderList(listLines));
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !HEADING_RE.test(lines[i]!) &&
      !BLOCKQUOTE_RE.test(lines[i]!) &&
      !FENCE_RE.test(lines[i]!) &&
      !isListLine(lines[i]!) &&
      !(lines[i]!.includes('|') && i + 1 < lines.length && isTableSeparatorRow(lines[i + 1]!))
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    out.push(`<p>${applyInline(paraLines.join('\n').replace(/\n/g, '<br>'))}</p>`);
  }
  return out.join('');
}

/** Render OSCAL markup-multiline to safe block HTML (ADR-0030's expanded metaschema subset). */
export function renderMultilineMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  return renderBlocks(escapeHtml(text).split('\n'));
}

/** Strip markdown markers to plain text (for titles, search indexing). */
export function stripMarkdown(text: string | null | undefined): string {
  if (!text) return '';
  const withoutFences = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''));
  const withoutBlockPrefixes = withoutFences
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/^>\s?/, '')
        .replace(/^\s*[-*+]\s+/, '')
        .replace(/^\s*\d+\.\s+/, ''),
    )
    .join('\n');
  // Protect backslash-escaped markup chars *before* stripping markers, so a literal `\*foo\*`
  // survives instead of being mistaken for (and stripped as) italic markup; restored after.
  const stripped = protectEscapes(withoutBlockPrefixes)
    .replace(/\|/g, ' ')
    .replace(INSERT_RE, '$1')
    .replace(LINK_RE, '$1')
    .replace(CODE_RE, '$1')
    .replace(BOLD_RE, '$1')
    .replace(ITALIC_RE, '$1')
    .replace(SUB_RE, '$1')
    .replace(SUP_RE, '$1');
  return restoreEscapes(stripped);
}
