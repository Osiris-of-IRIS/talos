/**
 * Generic collapsible section wrapper (SSP editor/detail sections+rows). Decision IDs: ADR-0001.
 * Covers TEST-COLLAPSE-02.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollapsibleSection } from '@/shared/CollapsibleSection';

describe('CollapsibleSection', () => {
  it('renders the summary always, and children only when open', () => {
    const { rerender } = render(
      <CollapsibleSection isOpen={false} onToggle={() => {}} summary="Summary text" testId="sect">
        <p data-testid="body-content">Body</p>
      </CollapsibleSection>,
    );
    expect(screen.getByTestId('sect-toggle')).toHaveTextContent('Summary text');
    expect(screen.queryByTestId('body-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('sect-toggle')).toHaveAttribute('aria-expanded', 'false');

    rerender(
      <CollapsibleSection isOpen={true} onToggle={() => {}} summary="Summary text" testId="sect">
        <p data-testid="body-content">Body</p>
      </CollapsibleSection>,
    );
    expect(screen.getByTestId('body-content')).toBeInTheDocument();
    expect(screen.getByTestId('sect-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('calls onToggle when the summary is clicked', async () => {
    const user = userEvent.setup();
    let toggled = false;
    render(
      <CollapsibleSection isOpen={false} onToggle={() => (toggled = true)} summary="S" testId="sect">
        <p>Body</p>
      </CollapsibleSection>,
    );
    await user.click(screen.getByTestId('sect-toggle'));
    expect(toggled).toBe(true);
  });
});
