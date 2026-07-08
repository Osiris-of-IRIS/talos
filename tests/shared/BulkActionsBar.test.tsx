/**
 * Shared bulk-selection action bar (ADR-0027): "N selected" + download/delete buttons.
 * Covers TEST-BULK-03.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BulkActionsBar } from '@/features/shared/BulkActionsBar';

describe('BulkActionsBar', () => {
  it('renders nothing when the count is zero', () => {
    const { container } = render(
      <BulkActionsBar
        count={0}
        downloadLabelKey="bulk_download_selected_zip"
        onDownload={vi.fn()}
        onDelete={vi.fn()}
        testIdPrefix="test"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the selected count and wires download/delete callbacks', async () => {
    const user = userEvent.setup();
    const onDownload = vi.fn();
    const onDelete = vi.fn();
    render(
      <BulkActionsBar
        count={3}
        downloadLabelKey="bulk_download_selected_zip"
        onDownload={onDownload}
        onDelete={onDelete}
        testIdPrefix="test"
      />,
    );
    expect(screen.getByTestId('test-selected-count')).toHaveTextContent('3');
    await user.click(screen.getByTestId('test-download-selected'));
    expect(onDownload).toHaveBeenCalledOnce();
    await user.click(screen.getByTestId('test-delete-selected'));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
