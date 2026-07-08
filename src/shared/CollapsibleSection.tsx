// Generic collapsible section (SSP editor/detail sections + per-item rows). Decision IDs: ADR-0011 (▾/▸).
import type { ReactNode } from 'react';

interface CollapsibleSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  summary: ReactNode;
  testId?: string;
  as?: 'section' | 'div';
  children: ReactNode;
}

export function CollapsibleSection({
  isOpen,
  onToggle,
  summary,
  testId,
  as: Wrapper = 'section',
  children,
}: CollapsibleSectionProps) {
  return (
    <Wrapper data-testid={testId}>
      <button
        type="button"
        className="collapsible-toggle"
        data-testid={testId ? `${testId}-toggle` : undefined}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        {isOpen ? '▾' : '▸'} {summary}
      </button>
      {isOpen && <div data-testid={testId ? `${testId}-body` : undefined}>{children}</div>}
    </Wrapper>
  );
}
