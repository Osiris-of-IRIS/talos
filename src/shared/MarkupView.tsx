// Truncate-and-expand display wrapper for OSCAL markup content. Decision IDs: ADR-0022
// (references ADR-0009). Use this — not <Markup> directly — wherever markup-line/markup-multiline
// content is *displayed* (ControlDisplay's own statement/param truncation, ADR-0016, is excluded).
import { useState } from 'react';
import { Markup } from './Markup';
import { Modal } from './Modal';
import { stripMarkdown } from './oscalMarkdown';
import './markupView.css';

const INLINE_BUDGET = 120;
const MULTILINE_BUDGET = 240;

interface MarkupViewProps {
  value: string | null | undefined;
  multiline?: boolean;
  className?: string;
  /** Human label for the field, used for the expand button's accessible name and modal title. */
  label?: string;
}

export function MarkupView({ value, multiline = false, className, label }: MarkupViewProps) {
  const [expanded, setExpanded] = useState(false);
  const plain = stripMarkdown(value).trim();
  if (!plain) return null;

  const budget = multiline ? MULTILINE_BUDGET : INLINE_BUDGET;
  const truncated = plain.length > budget;
  const containerClass = [
    'markup-view',
    multiline ? 'markup-view--multiline' : 'markup-view--inline',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (!truncated) {
    return <Markup value={value} multiline={multiline} className={containerClass} />;
  }

  const preview = `${plain.slice(0, budget).trimEnd()}…`;

  return (
    <span className={containerClass} data-testid="markup-view-truncated">
      {preview}{' '}
      <button
        type="button"
        className="markup-view-expand"
        data-testid="markup-view-expand"
        aria-label={label ? `Expand ${label}` : 'Expand full content'}
        title="Expand"
        onClick={() => setExpanded(true)}
      >
        ⤢
      </button>
      <Modal open={expanded} onClose={() => setExpanded(false)} title={label}>
        <Markup value={value} multiline />
      </Modal>
    </span>
  );
}
