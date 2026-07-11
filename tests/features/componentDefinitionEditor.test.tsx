/**
 * Component-definition editor: create, edit, link-externalization. Decision IDs: ADR-0001, ADR-0003, ADR-0015.
 * Covers TEST-CDEF-EDIT-01 (feature IMPL-001, T-101).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { saveSettings } from '@/data/settingsRepository';
import { ComponentDefinitionEditorPage } from '@/features/componentDefinitions/ComponentDefinitionEditorPage';
import { parseOscalUpload } from '@/data/fileIo';
import { getUnresolvedReferencesFor } from '@/data/unresolvedReferences';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { Catalog } from '@/models/catalog';
import catalogJson from '../data/catalog-minimal.json';

const repo = () => ArtifactRepository.forType<ComponentDefinition>('componentDefinition');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/component-definitions/new" element={<ComponentDefinitionEditorPage />} />
        <Route path="/component-definitions/:uuid/edit" element={<ComponentDefinitionEditorPage />} />
        <Route path="/component-definitions/:uuid" element={<div data-testid="detail-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('create', () => {
  it('creates a component-definition with a component and an externalized link', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');

    await user.type(screen.getByTestId('md-title'), 'My Policy');
    await user.click(screen.getByTestId('add-component'));
    await user.type(screen.getByTestId('component-title'), 'X'); // append to default title

    await user.type(screen.getByTestId('md-link-href'), 'https://nist.gov');
    await user.type(screen.getByTestId('md-link-text'), 'NIST');
    await user.click(screen.getByTestId('md-add-link'));

    await user.click(screen.getByTestId('save-compdef'));

    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const all = await repo().getAll();
    expect(all).toHaveLength(1);
    const cd = all[0]!.artifact;
    expect(cd.metadata.title).toBe('My Policy');
    expect(cd.components).toHaveLength(1);
    // external link externalized into back-matter, referenced by #uuid (ADR-0015)
    const link = cd.metadata.links?.[0];
    expect(link?.href).toMatch(/^#/);
    const resId = link!.href.slice(1);
    expect(cd.backMatter?.resources?.find((r) => r.uuid === resId)?.rlinks?.[0]?.href).toBe(
      'https://nist.gov',
    );
    expect(all[0]!.origin).toBe('user');
  });

  it('does not save without a title', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');
    await user.click(screen.getByTestId('save-compdef'));
    expect(await repo().count()).toBe(0);
  });

  it('seeds the default creator from global settings when configured (ADR-0033)', async () => {
    await saveSettings({ creatorName: 'Jane Doe', creatorEmail: 'jane@example.com' });
    renderAt('/component-definitions/new');
    await waitFor(() => expect(screen.getByTestId('md-creator-status')).toHaveTextContent('✓'));
    expect(screen.getByTestId('md-party')).toHaveTextContent('Jane Doe');
  });
});

describe('component body: type + control-implementations', () => {
  it('sets a custom type and builds a full implemented-requirement with a set-parameter', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');

    await user.type(screen.getByTestId('md-title'), 'Body Test');
    await user.click(screen.getByTestId('add-component'));

    // type field is a datalist input — accepts a standard value or a custom one
    const typeInput = screen.getByTestId('component-type');
    await user.clear(typeInput);
    await user.type(typeInput, 'policy');

    await user.click(screen.getByTestId('add-control-implementation'));
    await user.type(screen.getByTestId('ci-source-input'), '#cat-1');
    await user.click(screen.getByTestId('add-requirement'));
    await user.type(screen.getByTestId('ir-control-id-input'), 'ASST.1.1.2');
    await user.type(screen.getByTestId('ir-description-textarea'), 'nginx enforces the policy.');
    await user.type(screen.getByTestId('ir-remarks-textarea'), 'reviewed 2026');
    await user.click(screen.getByTestId('add-set-parameter'));
    await user.type(screen.getByTestId('sp-param-id-input'), 'asst.1.1.2-prm1');
    await user.type(screen.getByTestId('sp-values'), 'den IT-Betrieb, die Rolle');

    await user.click(screen.getByTestId('save-compdef'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const cd = (await repo().getAll())[0]!.artifact;
    const comp = cd.components![0]!;
    expect(comp.type).toBe('policy');
    const ci = comp.controlImplementations![0]!;
    expect(ci.source).toBe('#cat-1');
    const ir = ci.implementedRequirements[0]!;
    expect(ir.controlId).toBe('ASST.1.1.2');
    expect(ir.description).toBe('nginx enforces the policy.');
    expect(ir.remarks).toBe('reviewed 2026');
    expect(ir.setParameters![0]).toEqual({ paramId: 'asst.1.1.2-prm1', values: ['den IT-Betrieb', 'die Rolle'] });
  });
});

describe('source→catalog + param pickers (T-142)', () => {
  it('offers workspace catalogs, control-ids and params as search results', async () => {
    const user = userEvent.setup();
    // Seed a workspace catalog so the pickers have something to resolve.
    const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    await ArtifactRepository.forType<Catalog>('catalog').create({
      uuid: record.uuid,
      type: 'catalog',
      origin: 'imported',
      artifact: record.artifact,
    });

    renderAt('/component-definitions/new');

    await user.type(screen.getByTestId('md-title'), 'Picker Test');
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));

    // source search offers the catalog (async index load) by title
    await user.type(screen.getByTestId('ci-source-input'), 'BSI Kernel');
    expect(await screen.findByText('BSI Kernel (excerpt)')).toBeInTheDocument();

    // pick the catalog as source → resolves
    await user.clear(screen.getByTestId('ci-source-input'));
    await user.type(screen.getByTestId('ci-source-input'), `#${record.uuid}`);
    expect(await screen.findByTestId('ci-source-resolved')).toHaveTextContent('BSI Kernel (excerpt)');

    // add a requirement → its control-id search offers the catalog's control ids, with a
    // readable "{label|id} {title}" display text, not just the raw id (item 7)
    await user.click(screen.getByTestId('add-requirement'));
    await user.type(screen.getByTestId('ir-control-id-input'), 'ASST.1.1.2');
    expect(await screen.findByText('ASST.1.1.2 Zuweisung')).toBeInTheDocument();

    // once a control is chosen, its params are offered as set-parameter options
    await user.click(screen.getByTestId('add-set-parameter'));
    await user.type(screen.getByTestId('sp-param-id-input'), 'zuständigen');
    expect(await screen.findByText('zuständigen Personen oder Rollen')).toBeInTheDocument();
  });

  it('picking a catalog creates a back-matter resource and stores a resource-mediated source, not the raw catalog uuid (item 5)', async () => {
    const user = userEvent.setup();
    const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    await ArtifactRepository.forType<Catalog>('catalog').create({
      uuid: record.uuid,
      type: 'catalog',
      origin: 'imported',
      artifact: record.artifact,
    });

    renderAt('/component-definitions/new');
    await user.type(screen.getByTestId('md-title'), 'Source Resolution Test');
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));

    await user.type(screen.getByTestId('ci-source-input'), `#${record.uuid}`);
    await screen.findByTestId('ci-source-resolved');

    await user.click(screen.getByTestId('save-compdef'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const cd = (await repo().getAll())[0]!.artifact;
    const source = cd.components![0]!.controlImplementations![0]!.source;
    expect(source).not.toBe(`#${record.uuid}`); // not the raw catalog uuid
    const resourceUuid = source.slice(1);
    const resource = cd.backMatter?.resources?.find((r) => r.uuid === resourceUuid);
    expect(resource?.documentIds?.[0]?.identifier).toBe(record.uuid);
  });

  it('also accepts a workspace profile as source, resolved to its own effective control set (T-205, ADR-0032)', async () => {
    const user = userEvent.setup();
    const { record: catalogRecord } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    await ArtifactRepository.forType<Catalog>('catalog').create({
      uuid: catalogRecord.uuid,
      type: 'catalog',
      origin: 'imported',
      artifact: catalogRecord.artifact,
    });
    const profileUuid = 'ffffffff-0000-4000-8000-000000000001';
    await ArtifactRepository.forType('profile').create({
      uuid: profileUuid,
      type: 'profile',
      origin: 'user',
      artifact: {
        uuid: profileUuid,
        metadata: { title: 'BSI Baseline Profile', version: '1.0.0', oscalVersion: '1.2.2' },
        imports: [{ href: `#${catalogRecord.uuid}`, includeAll: {} }],
      },
    });

    renderAt('/component-definitions/new');
    await user.type(screen.getByTestId('md-title'), 'Profile Source Test');
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));

    // source search offers the profile too (badged, distinct from a catalog)
    await user.type(screen.getByTestId('ci-source-input'), 'BSI Baseline');
    expect(await screen.findByText('BSI Baseline Profile')).toBeInTheDocument();

    await user.clear(screen.getByTestId('ci-source-input'));
    await user.type(screen.getByTestId('ci-source-input'), `#${profileUuid}`);
    expect(await screen.findByTestId('ci-source-resolved')).toHaveTextContent('BSI Baseline Profile');
    expect(screen.getByTestId('ci-source-resolved')).toHaveTextContent('📑');

    // control-id/param pickers are seeded from the profile's own effective (recursively-resolved,
    // T-206) control set, exactly like a catalog source
    await user.click(screen.getByTestId('add-requirement'));
    await user.type(screen.getByTestId('ir-control-id-input'), 'ASST.1.1.2');
    expect(await screen.findByText('ASST.1.1.2 Zuweisung')).toBeInTheDocument();

    await user.click(screen.getByTestId('add-set-parameter'));
    await user.type(screen.getByTestId('sp-param-id-input'), 'zuständigen');
    expect(await screen.findByText('zuständigen Personen oder Rollen')).toBeInTheDocument();

    // picking a profile also gets the same back-matter-mediation as a catalog (item 5)
    await user.click(screen.getByTestId('save-compdef'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());
    const cd = (await repo().getAll())[0]!.artifact;
    const source = cd.components![0]!.controlImplementations![0]!.source;
    expect(source).not.toBe(`#${profileUuid}`);
    const resource = cd.backMatter?.resources?.find((r) => r.uuid === source.slice(1));
    expect(resource?.documentIds?.[0]?.identifier).toBe(profileUuid);
  });
});

describe('no workspace catalogs — guidance message (T-161)', () => {
  it('shows an info message linking to catalog upload/library when no catalogs exist', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');
    await user.type(screen.getByTestId('md-title'), 'No Catalogs');
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));

    const hint = await screen.findByTestId('no-catalogs-hint');
    expect(hint).toHaveTextContent(/upload|adopt/i);
    expect(screen.getByRole('link', { name: /catalogs/i })).toHaveAttribute('href', '/catalogs');
    expect(screen.getByRole('link', { name: /library/i })).toHaveAttribute('href', '/library');
  });

  it('does not show the message once a workspace catalog exists', async () => {
    const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    await ArtifactRepository.forType<Catalog>('catalog').create({
      uuid: record.uuid,
      type: 'catalog',
      origin: 'imported',
      artifact: record.artifact,
    });

    const user = userEvent.setup();
    renderAt('/component-definitions/new');
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));

    // async catalog-index load: confirm it's actually loaded (not just still null) by typing into
    // the source search and seeing the catalog offered, then assert the hint stays gone.
    await user.type(screen.getByTestId('ci-source-input'), 'BSI Kernel');
    expect(await screen.findByText('BSI Kernel (excerpt)')).toBeInTheDocument();
    expect(screen.queryByTestId('no-catalogs-hint')).not.toBeInTheDocument();
  });
});

describe('edit', () => {
  it('updates an existing component-definition', async () => {
    const uuid = '99999999-9999-4999-8999-999999999999';
    await repo().create({
      uuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: { uuid, metadata: { title: 'Old', version: '1.0.0', oscalVersion: '1.2.2' }, components: [] },
    });

    const user = userEvent.setup();
    renderAt(`/component-definitions/${uuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Old'));

    await user.clear(screen.getByTestId('md-title'));
    await user.type(screen.getByTestId('md-title'), 'New Title');
    await user.click(screen.getByTestId('save-compdef'));

    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());
    const rec = await repo().get(uuid);
    expect(rec?.artifact.metadata.title).toBe('New Title');
  });
});

describe('imports (ADR-0014)', () => {
  const editorUuid = '77777777-7777-4777-8777-777777777771';
  const otherUuid = '77777777-7777-4777-8777-777777777772';

  async function seedEditorAndOther() {
    await repo().create({
      uuid: editorUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: { uuid: editorUuid, metadata: { title: 'Editor Def', version: '1.0.0', oscalVersion: '1.2.2' } },
    });
    await repo().create({
      uuid: otherUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: { uuid: otherUuid, metadata: { title: 'Other Def', version: '1.0.0', oscalVersion: '1.2.2' } },
    });
  }

  it('does not offer the definition itself as an import option', async () => {
    await seedEditorAndOther();
    const user = userEvent.setup();
    renderAt(`/component-definitions/${editorUuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Editor Def'));

    // "Def" matches both "Editor Def" (self) and "Other Def" by title.
    await user.type(screen.getByTestId('cdef-import-picker-input'), 'Def');
    expect(await screen.findByText('Other Def')).toBeInTheDocument();
    expect(screen.queryByText('Editor Def')).not.toBeInTheDocument();
  });

  it('adds an import, referencing the target via a back-matter resource (not its uuid directly)', async () => {
    await seedEditorAndOther();
    const user = userEvent.setup();
    renderAt(`/component-definitions/${editorUuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Editor Def'));

    await user.type(screen.getByTestId('cdef-import-picker-input'), 'Other Def');
    await user.click(await screen.findByText('Other Def'));
    await user.click(screen.getByTestId('cdef-import-add'));

    expect(await screen.findByRole('link', { name: 'Other Def' })).toBeInTheDocument();
    await user.click(screen.getByTestId('save-compdef'));

    const rec = await repo().get(editorUuid);
    const imports = rec?.artifact.importComponentDefinitions;
    expect(imports).toHaveLength(1);
    expect(imports![0]!.href).not.toBe(`#${otherUuid}`); // resource-mediated, not the raw uuid
    const resource = rec?.artifact.backMatter?.resources?.find((r) => `#${r.uuid}` === imports![0]!.href);
    expect(resource?.documentIds?.[0]?.identifier).toBe(otherUuid);
  });

  it('removes an import', async () => {
    await repo().create({
      uuid: editorUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: editorUuid,
        metadata: { title: 'Editor Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: `#${otherUuid}` }],
      },
    });
    await repo().create({
      uuid: otherUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: { uuid: otherUuid, metadata: { title: 'Other Def', version: '1.0.0', oscalVersion: '1.2.2' } },
    });

    const user = userEvent.setup();
    renderAt(`/component-definitions/${editorUuid}/edit`);
    expect(await screen.findByTestId('cdef-import-item')).toBeInTheDocument();

    await user.click(screen.getByTestId('cdef-import-remove'));
    expect(screen.queryByTestId('cdef-import-item')).not.toBeInTheDocument();
  });

  it('records a dangling import href in unresolvedReferences on save (ADR-0014)', async () => {
    await repo().create({
      uuid: editorUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: editorUuid,
        metadata: { title: 'Editor Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: '#nonexistent' }],
      },
    });
    const user = userEvent.setup();
    renderAt(`/component-definitions/${editorUuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Editor Def'));

    await user.click(screen.getByTestId('save-compdef'));
    await waitFor(() => expect(screen.getByTestId('detail-landed')).toBeInTheDocument());

    const refs = await getUnresolvedReferencesFor(editorUuid);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.href).toBe('#nonexistent');
    expect(refs[0]!.refKind).toBe('import-component-definition');
  });

  it('shows an unresolved-reference marker for a dangling import href', async () => {
    await repo().create({
      uuid: editorUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: editorUuid,
        metadata: { title: 'Editor Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: '#nonexistent' }],
      },
    });
    renderAt(`/component-definitions/${editorUuid}/edit`);
    expect(await screen.findByTestId('cdef-import-unresolved')).toBeInTheDocument();
  });

  it('shows a summary banner counting unresolved imports (T-105)', async () => {
    await repo().create({
      uuid: editorUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: editorUuid,
        metadata: { title: 'Editor Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: '#nonexistent-1' }, { href: '#nonexistent-2' }],
      },
    });
    renderAt(`/component-definitions/${editorUuid}/edit`);
    expect(await screen.findByTestId('cdef-imports-unresolved-banner')).toHaveTextContent('2');
  });

  it('resolves a dangling import in place, clearing the banner and marker (T-105)', async () => {
    await repo().create({
      uuid: editorUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: editorUuid,
        metadata: { title: 'Editor Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: '#nonexistent', remarks: 'keep me' }],
      },
    });
    await repo().create({
      uuid: otherUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: { uuid: otherUuid, metadata: { title: 'Other Def', version: '1.0.0', oscalVersion: '1.2.2' } },
    });

    const user = userEvent.setup();
    renderAt(`/component-definitions/${editorUuid}/edit`);
    expect(await screen.findByTestId('cdef-import-unresolved')).toBeInTheDocument();

    await user.type(screen.getByTestId('cdef-import-resolve-picker-input'), otherUuid);
    await user.click(screen.getByTestId('cdef-import-resolve'));

    expect(await screen.findByRole('link', { name: 'Other Def' })).toBeInTheDocument();
    expect(screen.queryByTestId('cdef-import-unresolved')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cdef-imports-unresolved-banner')).not.toBeInTheDocument();
    // remarks are preserved across the resolve, not reset
    expect(screen.getByTestId('cdef-import-remarks')).toHaveValue('keep me');

    await user.click(screen.getByTestId('save-compdef'));
    expect(await getUnresolvedReferencesFor(editorUuid)).toHaveLength(0);
  });

  it('rejects an inline resolve that would create a cycle', async () => {
    await repo().create({
      uuid: editorUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: editorUuid,
        metadata: { title: 'Editor Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: '#nonexistent' }],
      },
    });
    // otherDef already imports editorDef — resolving editorDef's dangling import to otherDef
    // would close the loop.
    await repo().create({
      uuid: otherUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: otherUuid,
        metadata: { title: 'Other Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: `#${editorUuid}` }],
      },
    });

    const user = userEvent.setup();
    renderAt(`/component-definitions/${editorUuid}/edit`);
    await screen.findByTestId('cdef-import-unresolved');

    // The cycle-inducing definition isn't even offered as a resolve option (same proactive filter
    // as the add-import picker).
    await user.type(screen.getByTestId('cdef-import-resolve-picker-input'), 'Def');
    expect(screen.queryByText('Other Def')).not.toBeInTheDocument();
  });

  it('rejects an import that would create a cycle', async () => {
    await repo().create({
      uuid: editorUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: editorUuid,
        metadata: { title: 'Editor Def', version: '1.0.0', oscalVersion: '1.2.2' },
      },
    });
    // otherDef already imports editorDef — editorDef importing otherDef would close the loop.
    await repo().create({
      uuid: otherUuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid: otherUuid,
        metadata: { title: 'Other Def', version: '1.0.0', oscalVersion: '1.2.2' },
        importComponentDefinitions: [{ href: `#${editorUuid}` }],
      },
    });

    const user = userEvent.setup();
    renderAt(`/component-definitions/${editorUuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Editor Def'));

    // The cycle-inducing definition isn't even offered as an option (proactive UX filter).
    await user.type(screen.getByTestId('cdef-import-picker-input'), 'Def');
    expect(screen.queryByText('Other Def')).not.toBeInTheDocument();
  });
});

describe('component list — collapse/expand (item 2)', () => {
  const uuid = '88888888-8888-4888-8888-888888888888';

  async function seedTwoComponents() {
    await repo().create({
      uuid,
      type: 'componentDefinition',
      origin: 'user',
      artifact: {
        uuid,
        metadata: { title: 'Multi', version: '1.0.0', oscalVersion: '1.2.2' },
        components: [
          {
            uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            type: 'software',
            title: 'nginx',
            description: 'web server',
            controlImplementations: [
              {
                uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                source: '#cat-1',
                description: 'ci',
                implementedRequirements: [
                  { uuid: 'r1', controlId: 'ASST.1.1.2' },
                  { uuid: 'r2', controlId: 'ASST.1.1.3' },
                ],
              },
            ],
          },
          {
            uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            type: 'policy',
            title: 'password policy',
            description: 'policy doc',
          },
        ],
      },
    });
  }

  it('renders existing components collapsed (title/type/requirement count), and expands on click', async () => {
    await seedTwoComponents();
    const user = userEvent.setup();
    renderAt(`/component-definitions/${uuid}/edit`);
    await waitFor(() => expect(screen.getByTestId('md-title')).toHaveValue('Multi'));

    const summaries = screen.getAllByTestId('compdef-component-summary');
    expect(summaries).toHaveLength(2);
    expect(summaries[0]).toHaveClass('collapsible-toggle'); // UI feedback items 1+4
    expect(summaries[0]).toHaveTextContent('nginx');
    expect(summaries[0]).toHaveTextContent('software');
    expect(summaries[0]).toHaveTextContent('2'); // 2 implemented-requirements
    expect(summaries[1]).toHaveTextContent('password policy');
    expect(summaries[1]).toHaveTextContent('0');

    // collapsed by default: no field inputs visible yet
    expect(screen.queryAllByTestId('component-title')).toHaveLength(0);

    await user.click(summaries[0]!);
    expect(screen.getByTestId('component-title')).toHaveValue('nginx');

    // the other component is still collapsed
    expect(screen.queryAllByTestId('component-title')).toHaveLength(1);

    await user.click(summaries[0]!);
    expect(screen.queryAllByTestId('component-title')).toHaveLength(0);
  });

  it('auto-expands a newly-added component', async () => {
    const user = userEvent.setup();
    renderAt('/component-definitions/new');
    await user.click(screen.getByTestId('add-component'));
    expect(screen.getByTestId('component-title')).toBeInTheDocument();
  });
});
