/**
 * SSP Groups CRUD page (T-512, ADR-0037). Covers TEST-SGRP-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { createSspGroup } from '@/data/sspGroupRepository';
import { SspGroupsPage } from '@/features/sspGroups/SspGroupsPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <SspGroupsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('SspGroupsPage', () => {
  it('shows the empty state, then adds a new top-level group', async () => {
    renderPage();
    expect(await screen.findByTestId('ssp-groups-empty')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByTestId('ssp-group-new-title'), 'Berlin Site');
    await user.click(screen.getByTestId('ssp-group-add'));

    await waitFor(() => expect(screen.getAllByTestId('ssp-group-row')).toHaveLength(1));
    expect(screen.getByTestId('ssp-group-title')).toHaveValue('Berlin Site');
  });

  it('renames a group on blur', async () => {
    await createSspGroup({ uuid: 'g1', title: 'Original' });
    renderPage();
    const user = userEvent.setup();
    const input = await screen.findByTestId('ssp-group-title');
    await user.clear(input);
    await user.type(input, 'Renamed');
    await user.tab(); // blur

    await waitFor(async () => expect((await screen.findByTestId('ssp-group-title'))).toHaveValue('Renamed'));
  });

  it('reparents a group and excludes itself/descendants from the parent picker (no cycles)', async () => {
    await createSspGroup({ uuid: 'root', title: 'Root' });
    await createSspGroup({ uuid: 'child', title: 'Child', parentGroupUuid: 'root' });
    renderPage();

    const rows = await screen.findAllByTestId('ssp-group-row');
    expect(rows).toHaveLength(2);

    // Root's own parent-picker must not offer "Child" (its descendant) as an option.
    const rootRowIdx = (await screen.findAllByTestId('ssp-group-title')).findIndex((el) => (el as HTMLInputElement).value === 'Root');
    const rootParentSelect = screen.getAllByTestId('ssp-group-parent')[rootRowIdx]!;
    const optionLabels = [...rootParentSelect.querySelectorAll('option')].map((o) => o.textContent);
    expect(optionLabels).not.toContain('Child');
  });

  it('deleting a group reparents its children (visible immediately in the list)', async () => {
    globalThis.confirm = () => true;
    await createSspGroup({ uuid: 'root', title: 'Root' });
    await createSspGroup({ uuid: 'mid', title: 'Mid', parentGroupUuid: 'root' });
    await createSspGroup({ uuid: 'leaf', title: 'Leaf', parentGroupUuid: 'mid' });
    renderPage();

    const user = userEvent.setup();
    await screen.findAllByTestId('ssp-group-row');
    const midIdx = (await screen.findAllByTestId('ssp-group-title')).findIndex((el) => (el as HTMLInputElement).value === 'Mid');
    await user.click(screen.getAllByRole('button', { name: /Delete group/i })[midIdx]!);

    await waitFor(async () => expect(await screen.findAllByTestId('ssp-group-row')).toHaveLength(2));
  });
});
