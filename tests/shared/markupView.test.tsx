/**
 * <MarkupView> truncate/expand helper. Decision IDs: ADR-0001, ADR-0009, ADR-0022.
 * Covers TEST-MDV-01.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarkupView } from '@/shared/MarkupView';

describe('MarkupView', () => {
  it('renders short content in full, with no expand button', () => {
    render(<MarkupView value="A **short** note." />);
    expect(screen.getByText('short')).toBeInTheDocument();
    expect(screen.queryByTestId('markup-view-expand')).not.toBeInTheDocument();
  });

  it('renders nothing for empty/null content', () => {
    const { container } = render(<MarkupView value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('truncates long inline content (120 chars) and shows an expand button', () => {
    const long = 'x'.repeat(200);
    render(<MarkupView value={long} />);
    expect(screen.getByTestId('markup-view-truncated')).toBeInTheDocument();
    expect(screen.getByTestId('markup-view-expand')).toBeInTheDocument();
    expect(screen.getByTestId('markup-view-truncated').textContent).toContain('…');
    expect(screen.getByTestId('markup-view-truncated').textContent!.length).toBeLessThan(long.length);
  });

  it('gives multiline content a larger (240 char) budget than inline (120 char)', () => {
    const midLength = 'y'.repeat(180); // > inline budget, < multiline budget
    render(<MarkupView value={midLength} multiline />);
    expect(screen.queryByTestId('markup-view-expand')).not.toBeInTheDocument();
  });

  it('opens a modal with the full, formatted content on expand, and closes it', async () => {
    const user = userEvent.setup();
    const long = 'Intro '.repeat(60) + '**important** tail.';
    render(<MarkupView value={long} multiline label="Description" />);

    await user.click(screen.getByTestId('markup-view-expand'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('important');
    expect(dialog).toHaveTextContent('tail.');
    expect(dialog.querySelector('strong')).not.toBeNull();

    await user.click(screen.getByTestId('modal-close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
