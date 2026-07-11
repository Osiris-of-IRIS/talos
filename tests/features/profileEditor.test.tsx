/**
 * Profile editor: create, imports (source picker + all/by-id/exclude modes), set-parameters.
 * Decision IDs: ADR-0003, ADR-0032. Covers TEST-PROF-03 (feature CTRL-001, T-200/T-201).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { saveSettings } from '@/data/settingsRepository';
import { ProfileEditorPage } from '@/features/profiles/ProfileEditorPage';
import type { Profile } from '@/models/profile';
import type { Catalog } from '@/models/catalog';

const repo = () => ArtifactRepository.forType<Profile>('profile');
const catalogRepo = () => ArtifactRepository.forType<Catalog>('catalog');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profiles/new" element={<ProfileEditorPage />} />
        <Route path="/profiles/:uuid/edit" element={<ProfileEditorPage />} />
        <Route path="/profiles/:uuid" element={<div data-testid="detail-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const catalogUuid = 'cccccccc-1111-4111-8111-111111111111';

async function seedCatalog() {
  await catalogRepo().create({
    uuid: catalogUuid,
    type: 'catalog',
    origin: 'user',
    artifact: {
      uuid: catalogUuid,
      metadata: { title: 'Grundschutz Test', version: '1.0.0', oscalVersion: '1.2.2' },
      controls: [
        { id: 'APP.1.1.1', title: 'Secure web apps' },
        { id: 'APP.1.1.2', title: 'Inventory apps' },
      ],
    } as Catalog,
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('create', () => {
  it('does not save without a title', async () => {
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.click(screen.getByTestId('save-profile'));
    expect(screen.queryByTestId('detail-landed')).not.toBeInTheDocument();
  });

  it('seeds the default creator from global settings when configured, with no manual entry needed (ADR-0033)', async () => {
    await saveSettings({ creatorName: 'Jane Doe', creatorEmail: 'jane@example.com' });
    renderAt('/profiles/new');
    await waitFor(() => expect(screen.getByTestId('md-creator-status')).toHaveTextContent('✓'));
    expect(screen.getByTestId('md-party')).toHaveTextContent('Jane Doe');
  });

  it('leaves the creator unset (as before) when no global default is configured', async () => {
    renderAt('/profiles/new');
    await waitFor(() => expect(screen.getByTestId('md-title')).toBeInTheDocument());
    expect(screen.getByTestId('md-creator-status')).not.toHaveTextContent('✓');
    expect(screen.queryByTestId('md-party')).not.toBeInTheDocument();
  });

  it('creates a profile with the as-is merge strategy pre-set (ADR-0032 §6)', async () => {
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.type(screen.getByTestId('md-title'), 'My Profile');
    await user.click(screen.getByTestId('save-profile'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const items = await repo().getAll();
    expect(items).toHaveLength(1);
    expect(items[0]!.artifact.merge).toEqual({ asIs: true });
  });
});

describe('imports', () => {
  it('adds a catalog import via the entity-search picker, resource-mediated (not the raw uuid)', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.type(screen.getByTestId('md-title'), 'My Profile');

    await user.type(screen.getByTestId('profile-import-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    await user.click(screen.getByTestId('profile-import-add'));

    expect(await screen.findByTestId('profile-import-source')).toHaveTextContent('Grundschutz Test');
    await user.click(screen.getByTestId('save-profile'));

    const rec = (await repo().getAll())[0]!;
    const imp = rec.artifact.imports[0]!;
    expect(imp.href).not.toBe(`#${catalogUuid}`);
    const resource = rec.artifact.backMatter?.resources?.find((r) => `#${r.uuid}` === imp.href);
    expect(resource?.documentIds?.[0]?.identifier).toBe(catalogUuid);
    expect(imp.includeAll).toEqual({});
  });

  it('switching to "specific controls" mode shows the checklist and records picked ids', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.type(screen.getByTestId('md-title'), 'My Profile');
    await user.type(screen.getByTestId('profile-import-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    await user.click(screen.getByTestId('profile-import-add'));
    await screen.findByTestId('profile-import-source');

    await user.click(screen.getByTestId('profile-import-mode-by-id'));
    const checkboxes = await screen.findAllByTestId('control-checklist-checkbox');
    expect(checkboxes).toHaveLength(2);
    await user.click(checkboxes[0]!);
    expect(screen.getByTestId('control-checklist-count')).toHaveTextContent('1');

    await user.click(screen.getByTestId('save-profile'));
    const rec = (await repo().getAll())[0]!;
    expect(rec.artifact.imports[0]!.includeControls?.[0]?.withIds).toEqual(['APP.1.1.1']);
  });

  it('filters the checklist by statement/title text', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.type(screen.getByTestId('md-title'), 'My Profile');
    await user.type(screen.getByTestId('profile-import-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    await user.click(screen.getByTestId('profile-import-add'));
    await user.click(screen.getByTestId('profile-import-mode-by-id'));
    await screen.findAllByTestId('control-checklist-checkbox');

    await user.type(screen.getByTestId('control-checklist-filter'), 'Inventory');
    const rows = await screen.findAllByTestId('control-checklist-item');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Inventory apps');
  });

  it('excludes specific controls independently of the include mode', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.type(screen.getByTestId('md-title'), 'My Profile');
    await user.type(screen.getByTestId('profile-import-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    await user.click(screen.getByTestId('profile-import-add'));
    await screen.findByTestId('profile-import-source');

    await user.click(screen.getByTestId('profile-import-exclude-toggle'));
    const checklist = await screen.findByTestId('profile-import-exclude-checklist');
    const excludeBoxes = await screen.findAllByTestId('control-checklist-checkbox');
    void checklist;
    await user.click(excludeBoxes[excludeBoxes.length - 1]!);

    await user.click(screen.getByTestId('save-profile'));
    const rec = (await repo().getAll())[0]!;
    expect(rec.artifact.imports[0]!.includeAll).toEqual({});
    expect(rec.artifact.imports[0]!.excludeControls?.[0]?.withIds).toEqual(['APP.1.1.2']);
  });

  it('a profile-sourced import gets the real checklist, not the plain-text fallback (T-206, ADR-0032 §5)', async () => {
    await seedCatalog();
    const baselineUuid = 'pppppppp-0000-4000-8000-000000000003';
    await repo().create({
      uuid: baselineUuid,
      type: 'profile',
      origin: 'user',
      artifact: {
        uuid: baselineUuid,
        metadata: { title: 'Baseline Profile', version: '1.0.0', oscalVersion: '1.2.2' },
        imports: [{ href: `#${catalogUuid}`, includeAll: {} }],
      },
    });
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.type(screen.getByTestId('md-title'), 'My Profile');
    await user.type(screen.getByTestId('profile-import-picker-input'), 'Baseline');
    await user.click(await screen.findByText('Baseline Profile'));
    await user.click(screen.getByTestId('profile-import-add'));
    await screen.findByTestId('profile-import-source');

    await user.click(screen.getByTestId('profile-import-mode-by-id'));
    expect(screen.queryByTestId('profile-import-include-text')).not.toBeInTheDocument();
    const checkboxes = await screen.findAllByTestId('control-checklist-checkbox');
    expect(checkboxes).toHaveLength(2); // the baseline profile's own resolved controls (recursed through its catalog import)

    await user.click(checkboxes[0]!);
    await user.click(screen.getByTestId('save-profile'));
    const rec = (await repo().getAll())[0]!;
    expect(rec.artifact.imports[0]!.includeControls?.[0]?.withIds).toEqual(['APP.1.1.1']);
  });

  it("shows a hint (doesn't crash) when a profile-sourced import's own chain has a dangling reference", async () => {
    const brokenUuid = 'pppppppp-0000-4000-8000-000000000004';
    await repo().create({
      uuid: brokenUuid,
      type: 'profile',
      origin: 'user',
      artifact: {
        uuid: brokenUuid,
        metadata: { title: 'Broken Profile', version: '1.0.0', oscalVersion: '1.2.2' },
        imports: [{ href: '#does-not-exist', includeAll: {} }],
      },
    });
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.type(screen.getByTestId('md-title'), 'My Profile');
    await user.type(screen.getByTestId('profile-import-picker-input'), 'Broken');
    await user.click(await screen.findByText('Broken Profile'));
    await user.click(screen.getByTestId('profile-import-add'));
    await screen.findByTestId('profile-import-source');

    expect(await screen.findByTestId('profile-import-nested-unresolved-hint')).toBeInTheDocument();
  });

  it('proactively excludes a profile import that would create a cycle (mirrors T-102/ADR-0014)', async () => {
    const editorUuid = 'pppppppp-0000-4000-8000-000000000001';
    const otherUuid = 'pppppppp-0000-4000-8000-000000000002';
    await repo().create({
      uuid: editorUuid,
      type: 'profile',
      origin: 'user',
      artifact: { uuid: editorUuid, metadata: { title: 'Editor Profile', version: '1.0.0', oscalVersion: '1.2.2' }, imports: [] },
    });
    await repo().create({
      uuid: otherUuid,
      type: 'profile',
      origin: 'user',
      artifact: {
        uuid: otherUuid,
        metadata: { title: 'Other Profile', version: '1.0.0', oscalVersion: '1.2.2' },
        imports: [{ href: `#${editorUuid}`, includeAll: {} }],
      },
    });
    const user = userEvent.setup();
    renderAt(`/profiles/${editorUuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Editor Profile'));

    // "Other Profile" already imports the editor profile, so importing it back would cycle —
    // it's excluded from the candidate list entirely, not offered then rejected.
    await user.type(screen.getByTestId('profile-import-picker-input'), 'Other');
    await waitFor(() => expect(screen.queryByTestId('profile-import-picker-results')).not.toBeInTheDocument());
  });
});

describe('set-parameters', () => {
  it('adds and saves a set-parameter', async () => {
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.type(screen.getByTestId('md-title'), 'My Profile');
    await user.click(screen.getByTestId('profile-sp-add'));
    await user.type(screen.getByTestId('profile-sp-param-id'), 'ia-5.1_prm_2');
    await user.type(screen.getByTestId('profile-sp-values'), '14, 30');
    await user.click(screen.getByTestId('save-profile'));

    const rec = (await repo().getAll())[0]!;
    expect(rec.artifact.modify?.setParameters).toEqual([{ paramId: 'ia-5.1_prm_2', values: ['14', '30'] }]);
  });

  it('removing an earlier row does not leak its stale text into the row that shifts into its place', async () => {
    const user = userEvent.setup();
    renderAt('/profiles/new');
    await user.type(screen.getByTestId('md-title'), 'My Profile');

    await user.click(screen.getByTestId('profile-sp-add'));
    const paramIdInputs1 = screen.getAllByTestId('profile-sp-param-id');
    await user.type(paramIdInputs1[0]!, 'p1');
    await user.type(screen.getAllByTestId('profile-sp-values')[0]!, '1, 2');

    await user.click(screen.getByTestId('profile-sp-add'));
    const paramIdInputs2 = screen.getAllByTestId('profile-sp-param-id');
    await user.type(paramIdInputs2[1]!, 'p2');
    await user.type(screen.getAllByTestId('profile-sp-values')[1]!, '3, 4');

    // Remove the first row (p1); the second row (p2) shifts to index 0.
    await user.click(screen.getAllByTestId('profile-sp-remove')[0]!);

    // The remaining row must display p2's own values, not p1's stale buffered text.
    expect(screen.getByTestId('profile-sp-param-id')).toHaveValue('p2');
    expect(screen.getByTestId('profile-sp-values')).toHaveValue('3, 4');

    // Editing it now must only affect p2 — not resurrect/mix in p1's data.
    await user.type(screen.getByTestId('profile-sp-values'), ', 5');
    await user.click(screen.getByTestId('save-profile'));

    const rec = (await repo().getAll())[0]!;
    expect(rec.artifact.modify?.setParameters).toEqual([{ paramId: 'p2', values: ['3', '4', '5'] }]);
  });
});
