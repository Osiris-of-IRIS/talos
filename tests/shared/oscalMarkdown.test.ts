/**
 * OSCAL markup renderer tests, incl. XSS prevention. Decision IDs: ADR-0001, ADR-0009.
 * Covers TEST-MD-01 (feature_registry PLAT-004).
 */
import { describe, it, expect } from 'vitest';
import {
  renderInlineMarkdown,
  renderMultilineMarkdown,
  stripMarkdown,
  isSafeUrl,
  escapeHtml,
} from '@/shared/oscalMarkdown';

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;',
    );
  });
});

describe('inline markdown subset', () => {
  it('renders bold, italic, code', () => {
    expect(renderInlineMarkdown('**b** *i* `c`')).toBe(
      '<strong>b</strong> <em>i</em> <code>c</code>',
    );
  });

  it('renders subscript and superscript', () => {
    expect(renderInlineMarkdown('H~2~O x^2^')).toBe('H<sub>2</sub>O x<sup>2</sup>');
  });

  it('renders safe links with rel=noopener', () => {
    expect(renderInlineMarkdown('[NIST](https://pages.nist.gov)')).toBe(
      '<a href="https://pages.nist.gov" rel="noopener noreferrer">NIST</a>',
    );
  });

  it('allows app-relative links', () => {
    expect(renderInlineMarkdown('[here](/profiles)')).toContain('href="/profiles"');
    expect(renderInlineMarkdown('[anchor](#ssps)')).toContain('href="#ssps"');
  });

  it('empty/null input yields empty string', () => {
    expect(renderInlineMarkdown('')).toBe('');
    expect(renderInlineMarkdown(null)).toBe('');
    expect(renderInlineMarkdown(undefined)).toBe('');
  });
});

describe('XSS prevention', () => {
  it('escapes raw HTML tags', () => {
    const out = renderInlineMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('neutralizes img/onerror injection', () => {
    const out = renderInlineMarkdown('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });

  it('drops javascript: links (no anchor emitted) but keeps the text', () => {
    const out = renderInlineMarkdown('[click](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('<a ');
    expect(out).toContain('click');
  });

  it('drops data: and file: links', () => {
    expect(renderInlineMarkdown('[x](data:text/html,<script>)')).not.toContain('data:');
    expect(renderInlineMarkdown('[x](file:///etc/passwd)')).not.toContain('file:');
  });

  it('does not allow attribute breakout via quotes in link text', () => {
    const out = renderInlineMarkdown('[a"onmouseover="alert(1)](https://x.com)');
    expect(out).not.toContain('onmouseover="alert');
    expect(out).toContain('&quot;');
  });
});

describe('isSafeUrl', () => {
  it('accepts http(s) and app-relative', () => {
    expect(isSafeUrl('https://x.com')).toBe(true);
    expect(isSafeUrl('http://x.com')).toBe(true);
    expect(isSafeUrl('/x')).toBe(true);
    expect(isSafeUrl('#x')).toBe(true);
  });
  it('rejects dangerous schemes', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,x')).toBe(false);
    expect(isSafeUrl('vbscript:x')).toBe(false);
    expect(isSafeUrl('file:///x')).toBe(false);
  });
});

describe('multiline', () => {
  it('splits paragraphs on blank lines and converts single newlines to <br>', () => {
    expect(renderMultilineMarkdown('a\n\nb')).toBe('<p>a</p><p>b</p>');
    expect(renderMultilineMarkdown('a\nb')).toBe('<p>a<br>b</p>');
  });
  it('applies inline formatting within paragraphs and stays XSS-safe', () => {
    expect(renderMultilineMarkdown('**bold**\n\n<script>')).toBe(
      '<p><strong>bold</strong></p><p>&lt;script&gt;</p>',
    );
  });
});

describe('stripMarkdown', () => {
  it('removes markers and link URLs', () => {
    expect(stripMarkdown('**b** *i* `c` [t](https://x) H~2~O x^2^')).toBe('b i c t H2O x2');
  });
});
