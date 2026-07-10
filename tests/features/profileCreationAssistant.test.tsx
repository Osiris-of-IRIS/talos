/**
 * Profile Creation Assistant (ADR-0032 §4): metadata + source + inclusion-mode flow, the
 * target-object picker's ancestor-inclusive matching, the "product specification only" filter,
 * and the by-id checklist path. Covers TEST-PROF-06.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { ProfileCreationAssistantPage } from '@/features/profiles/ProfileCreationAssistantPage';
import type { Profile } from '@/models/profile';
import type { Catalog } from '@/models/catalog';

const rootUuid = 'aaaaaaaa-0000-4000-8000-000000000001';
const childUuid = 'aaaaaaaa-0000-4000-8000-000000000002';

vi.mock('@/data/targetObjectCategoryLoader', () => ({
  loadTargetObjectCategories: vi.fn(async () => ({
    rows: [
      { title: 'Standorte', definition: 'Physical sites', typ: '', category: '', synonyms: '', parentUuid: undefined, uuid: rootUuid },
      { title: 'Gebäude', definition: 'Buildings', typ: '', category: '', synonyms: '', parentUuid: rootUuid, uuid: childUuid },
    ],
    fromCache: false,
  })),
}));

const repo = () => ArtifactRepository.forType<Profile>('profile');
const catalogRepo = () => ArtifactRepository.forType<Catalog>('catalog');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profiles/assistant" element={<ProfileCreationAssistantPage />} />
        <Route path="/profiles/:uuid" element={<div data-testid="detail-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const catalogUuid = 'cccccccc-9999-4999-8999-999999999999';

async function seedCatalog() {
  await catalogRepo().create({
    uuid: catalogUuid,
    type: 'catalog',
    origin: 'user',
    artifact: {
      uuid: catalogUuid,
      metadata: { title: 'Grundschutz Test', version: '1.0.0', oscalVersion: '1.2.2' },
      controls: [
        { id: 'C1', title: 'Root-tagged control', props: [{ name: 'target_object_categories', value: 'Standorte' }] },
        { id: 'C2', title: 'Child-tagged control', props: [{ name: 'target_object_categories', value: 'Gebäude' }] },
        {
          id: 'C3',
          title: 'Child-tagged, product-spec control',
          props: [
            { name: 'target_object_categories', value: 'Gebäude' },
            { name: 'tags', value: 'Compliance Management, Produktspezifikation' },
          ],
        },
        { id: 'C4', title: 'Untagged control' },
      ],
    } as Catalog,
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('metadata + source gating', () => {
  it('disables create until a title and source are set', async () => {
    await seedCatalog();
    renderAt('/profiles/assistant');
    expect(screen.getByTestId('profile-assistant-create')).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByTestId('md-title'), 'Assistant Profile');
    expect(screen.getByTestId('profile-assistant-create')).toBeDisabled();

    await user.type(screen.getByTestId('profile-assistant-source-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    expect(screen.getByTestId('profile-assistant-create')).not.toBeDisabled();
  });
});

describe('by-id inclusion mode', () => {
  it('creates a profile with the picked control ids', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/profiles/assistant');
    await user.type(screen.getByTestId('md-title'), 'Assistant Profile');
    await user.type(screen.getByTestId('profile-assistant-source-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));

    await user.click(screen.getByTestId('profile-assistant-mode-by-id'));
    const boxes = await screen.findAllByTestId('control-checklist-checkbox');
    expect(boxes).toHaveLength(4);
    await user.click(boxes[0]!);

    await user.click(screen.getByTestId('profile-assistant-create'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const rec = (await repo().getAll())[0]!;
    expect(rec.artifact.imports[0]!.includeControls?.[0]?.withIds).toEqual(['C1']);
  });
});

describe('target-object inclusion mode', () => {
  it('selecting a child node includes controls tagged with it AND its ancestor root', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/profiles/assistant');
    await user.type(screen.getByTestId('md-title'), 'Assistant Profile');
    await user.type(screen.getByTestId('profile-assistant-source-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    await user.click(screen.getByTestId('profile-assistant-mode-target-object'));

    const nodes = await screen.findAllByTestId('target-object-node');
    expect(nodes).toHaveLength(2); // Standorte (root) + Gebäude (child)
    const childNode = screen.getByText('Gebäude');
    await user.click(childNode);

    // C1 (Standorte), C2 + C3 (Gebäude) all match; C4 (untagged) never does.
    expect(screen.getByTestId('target-object-match-count')).toHaveTextContent('3');

    const rootNode = screen.getByText('Standorte');
    expect(rootNode).toHaveAttribute('data-state', 'included'); // ancestor of the selection, not itself clicked
    expect(childNode).toHaveAttribute('data-state', 'selected');

    await user.click(screen.getByTestId('profile-assistant-create'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const rec = (await repo().getAll())[0]!;
    expect(rec.artifact.imports[0]!.includeControls?.[0]?.withIds).toEqual(expect.arrayContaining(['C1', 'C2', 'C3']));
    expect(rec.artifact.imports[0]!.includeControls?.[0]?.withIds).toHaveLength(3);
  });

  it('the "product specification only" filter narrows to tagged controls', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/profiles/assistant');
    await user.type(screen.getByTestId('md-title'), 'Assistant Profile');
    await user.type(screen.getByTestId('profile-assistant-source-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    await user.click(screen.getByTestId('profile-assistant-mode-target-object'));

    await user.click(screen.getByText('Gebäude'));
    expect(screen.getByTestId('target-object-match-count')).toHaveTextContent('3');

    await user.click(screen.getByTestId('target-object-product-spec-only'));
    expect(screen.getByTestId('target-object-match-count')).toHaveTextContent('1');
  });

  it('deselecting a node drops ancestor inclusion unless another selection keeps it alive', async () => {
    await seedCatalog();
    const user = userEvent.setup();
    renderAt('/profiles/assistant');
    await user.type(screen.getByTestId('md-title'), 'Assistant Profile');
    await user.type(screen.getByTestId('profile-assistant-source-picker-input'), 'Grundschutz');
    await user.click(await screen.findByText('Grundschutz Test'));
    await user.click(screen.getByTestId('profile-assistant-mode-target-object'));

    const childNode = screen.getByText('Gebäude');
    await user.click(childNode);
    expect(screen.getByText('Standorte')).toHaveAttribute('data-state', 'included');

    await user.click(childNode);
    expect(screen.getByText('Standorte')).toHaveAttribute('data-state', 'none');
    expect(screen.getByTestId('target-object-match-count')).toHaveTextContent('0');
  });
});
