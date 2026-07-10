/**
 * <TargetObjectPicker> (ADR-0032 §4): warns (once, via the shared toast) when a root
 * target-object category's title has no entry in ROOT_CATEGORY_COLORS, instead of silently
 * rendering that whole subtree gray. Covers TEST-PROF-09 (T-208e).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TargetObjectPicker } from '@/features/profiles/TargetObjectPicker';
import { ToastProvider } from '@/shared/toast';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';

function cat(uuid: string, title: string): TargetObjectCategory {
  return { uuid, title, parentUuid: undefined, definition: '', typ: '', category: '', synonyms: '' };
}

function renderPicker(categoryRows: TargetObjectCategory[]) {
  return render(
    <ToastProvider>
      <TargetObjectPicker
        categoryRows={categoryRows}
        controlsById={new Map()}
        selectedUuids={new Set()}
        onChange={() => {}}
        productSpecOnly={false}
        onProductSpecOnlyChange={() => {}}
      />
    </ToastProvider>,
  );
}

describe('unmapped root category color', () => {
  it('warns when a root category title has no color mapping', async () => {
    renderPicker([cat('r1', 'Ein neu umbenanntes Root')]);
    const toast = await screen.findByTestId('toast');
    expect(toast).toHaveAttribute('data-level', 'warning');
    expect(toast).toHaveTextContent('Ein neu umbenanntes Root');
  });

  it('does not warn for a known root category (e.g. Standorte)', () => {
    renderPicker([cat('r1', 'Standorte')]);
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
  });
});
