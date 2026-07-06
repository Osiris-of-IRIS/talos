// React wrapper for safe OSCAL markup rendering. Decision IDs: ADR-0009.
// The renderer guarantees XSS-safe HTML, so dangerouslySetInnerHTML is the intended use here.
import { renderInlineMarkdown, renderMultilineMarkdown } from './oscalMarkdown';

interface MarkupProps {
  value: string | null | undefined;
  multiline?: boolean;
  className?: string;
}

export function Markup({ value, multiline = false, className }: MarkupProps) {
  const html = multiline ? renderMultilineMarkdown(value) : renderInlineMarkdown(value);
  if (multiline) {
    return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
