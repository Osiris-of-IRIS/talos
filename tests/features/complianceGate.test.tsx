/**
 * Compliance gate (ADR-0040, PO decision backlog #3): only OSCAL-compliant artifacts may be used as
 * input to a later step. At every consumption point a non-compliant candidate is marked in the
 * picker, picking it is refused, and the UI says why and which fields to fix; compliant inputs keep
 * working. Consumption points (ADR-0040 §"Consumption points"):
 *   G1 SSP editor › import-profile            G5 component-definition editor › import-component-definition
 *   G2 SSP editor › component import (+refresh, G2b) G6 component-definition editor › control-implementation source
 *   G3 profile editor › add import             G7 component-definition assistant › source
 *   G4 profile assistant › source              G8 bootstrap assistant › baseline (catalog / profile)
 * Decision IDs: ADR-0001, ADR-0040, ADR-0032, ADR-0036, ADR-0026, ADR-0014, ADR-0023.
 * Covers TEST-SCHEMA-08.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { _resetComplianceForTests, getComplianceStats } from '@/data/complianceCheck';
import { ToastProvider } from '@/shared/toast';
import { SspEditorPage } from '@/features/ssps/SspEditorPage';
import { ProfileEditorPage } from '@/features/profiles/ProfileEditorPage';
import { ProfileCreationAssistantPage } from '@/features/profiles/ProfileCreationAssistantPage';
import { ComponentDefinitionEditorPage } from '@/features/componentDefinitions/ComponentDefinitionEditorPage';
import { ComponentDefinitionAssistantPage } from '@/features/componentDefinitions/ComponentDefinitionAssistantPage';
import { BootstrapAssistantPage } from '@/features/bootstrap/BootstrapAssistantPage';
import { useAssetsStore } from '@/features/assets/store';
import { useCatalogsStore } from '@/features/catalogs/store';
import type { Catalog } from '@/models/catalog';
import type { Profile } from '@/models/profile';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { SystemSecurityPlan } from '@/models/ssp';
import { importComponentFromDefinition } from '@/features/ssps/componentImport';
import { createBlankSsp } from '@/features/ssps/blank';

vi.mock('@/data/targetObjectCategoryLoader', () => ({
  loadTargetObjectCategories: vi.fn(async () => ({ rows: [], fromCache: false })),
}));

const LM = '2026-11-19T10:00:00Z';
const GOOD_CATALOG = '1a1a1a1a-0000-4000-8000-000000000001';
const BAD_CATALOG = '1a1a1a1a-0000-4000-8000-000000000002';
const GOOD_PROFILE = '2b2b2b2b-0000-4000-8000-000000000001';
const BAD_PROFILE = '2b2b2b2b-0000-4000-8000-000000000002';
const GOOD_CDEF = '3c3c3c3c-0000-4000-8000-000000000001';
const BAD_CDEF = '3c3c3c3c-0000-4000-8000-000000000002';

function catalog(uuid: string, title: string, lastModified?: string): Catalog {
  return {
    uuid,
    metadata: {
      title,
      version: '1.0.0',
      oscalVersion: '1.2.3',
      ...(lastModified ? { lastModified } : {}),
    },
    controls: [{ id: 'CTRL-1', title: 'Control One' }],
  };
}

function profile(uuid: string, title: string, lastModified?: string): Profile {
  return {
    uuid,
    metadata: {
      title,
      version: '1.0.0',
      oscalVersion: '1.2.3',
      ...(lastModified ? { lastModified } : {}),
    },
    imports: [{ href: `#${GOOD_CATALOG}`, includeAll: {} }],
    merge: { asIs: true },
  };
}

function cdef(uuid: string, title: string, lastModified?: string): ComponentDefinition {
  return {
    uuid,
    metadata: {
      title,
      version: '1.0.0',
      oscalVersion: '1.2.3',
      ...(lastModified ? { lastModified } : {}),
    },
    components: [
      {
        uuid: uuid.replace(/1$|2$/, '9'),
        type: 'software',
        title: `${title} component`,
        description: 'A component.',
      },
    ],
  };
}

async function seedAll() {
  const c = ArtifactRepository.forType<Catalog>('catalog');
  await c.create({
    uuid: GOOD_CATALOG,
    type: 'catalog',
    origin: 'user',
    artifact: catalog(GOOD_CATALOG, 'Good Catalog', LM),
  });
  // Missing metadata.last-modified → not OSCAL compliant (e.g. a hand-made or third-party file).
  await c.create({
    uuid: BAD_CATALOG,
    type: 'catalog',
    origin: 'imported',
    artifact: catalog(BAD_CATALOG, 'Broken Catalog'),
  });
  const p = ArtifactRepository.forType<Profile>('profile');
  await p.create({
    uuid: GOOD_PROFILE,
    type: 'profile',
    origin: 'user',
    artifact: profile(GOOD_PROFILE, 'Good Profile', LM),
  });
  await p.create({
    uuid: BAD_PROFILE,
    type: 'profile',
    origin: 'imported',
    artifact: profile(BAD_PROFILE, 'Broken Profile'),
  });
  const d = ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
  await d.create({
    uuid: GOOD_CDEF,
    type: 'componentDefinition',
    origin: 'user',
    artifact: cdef(GOOD_CDEF, 'Good CD', LM),
  });
  await d.create({
    uuid: BAD_CDEF,
    type: 'componentDefinition',
    origin: 'imported',
    artifact: cdef(BAD_CDEF, 'Broken CD'),
  });
}

function renderAt(path: string, routePath: string, element: JSX.Element) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="*" element={<div data-testid="landed" />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

/** The blocked-input notice names the artifact and the field to fix (metadata › last modified). */
async function expectBlocked(title: string) {
  const notice = await screen.findByTestId('input-blocked-notice');
  expect(notice).toHaveTextContent(title);
  expect(notice).toHaveTextContent('Metadata › Last modified: Required field is missing.');
  return notice;
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  _resetComplianceForTests();
  useAssetsStore.setState({
    assets: [],
    assetTypes: [],
    loading: false,
    error: null,
    warnings: [],
  });
  useCatalogsStore.setState({ items: [], loading: false, error: null, warnings: [] });
  await seedAll();
});

afterEach(() => {
  // @ts-expect-error test-only cleanup of the global override
  delete globalThis.confirm;
});

describe('G1 SSP editor › import-profile', () => {
  it('marks the non-compliant profile in the picker and refuses it with an explanation', async () => {
    const confirm = vi.fn(() => true);
    globalThis.confirm = confirm;
    const user = userEvent.setup();
    renderAt('/ssps/new', '/ssps/new', <SspEditorPage />);
    await user.type(screen.getByTestId('ssp-import-profile-input'), 'Profile');
    const bad = await screen.findByText('Broken Profile');
    await waitFor(() => expect(bad.closest('li')).toHaveTextContent('not OSCAL-compliant'));
    await user.click(bad);
    await expectBlocked('Broken Profile');
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByTestId('ssp-import-profile-resolved')).not.toBeInTheDocument();
    expect(getComplianceStats().gateBlocked).toBeGreaterThan(0);
  });

  it('a compliant profile is accepted (and clears an earlier notice)', async () => {
    globalThis.confirm = () => true;
    const user = userEvent.setup();
    renderAt('/ssps/new', '/ssps/new', <SspEditorPage />);
    await user.type(screen.getByTestId('ssp-import-profile-input'), 'Profile');
    await user.click(await screen.findByText('Broken Profile'));
    await expectBlocked('Broken Profile');
    await user.click(screen.getByTestId('md-title')); // blur, so re-focusing the picker reopens it
    await user.type(screen.getByTestId('ssp-import-profile-input'), 'Good');
    await user.click(await screen.findByText('Good Profile'));
    await waitFor(() =>
      expect(screen.getByTestId('ssp-import-profile-resolved')).toHaveTextContent('Good Profile'),
    );
    expect(screen.queryByTestId('input-blocked-notice')).not.toBeInTheDocument();
  });
});

describe('G2 SSP editor › component import from a component-definition', () => {
  it('refuses a non-compliant component-definition; a compliant one imports', async () => {
    const user = userEvent.setup();
    renderAt('/ssps/new', '/ssps/new', <SspEditorPage />);
    await waitFor(() => expect(screen.getByTestId('si-cd-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('si-cd-select'), BAD_CDEF);
    await expectBlocked('Broken CD');
    expect(screen.getByTestId('si-import')).toBeDisabled();

    await user.selectOptions(screen.getByTestId('si-cd-select'), GOOD_CDEF);
    await user.selectOptions(screen.getByTestId('si-component-select'), 'Good CD component');
    await waitFor(() => expect(screen.getByTestId('si-import')).toBeEnabled());
    await user.click(screen.getByTestId('si-import'));
    expect(screen.getAllByTestId('si-component')).toHaveLength(1);
  });
});

describe('G2b SSP editor › refresh a stale imported component', () => {
  it('refuses to refresh from a source component-definition that has become non-compliant', async () => {
    const d = ArtifactRepository.forType<ComponentDefinition>('componentDefinition');
    const source = cdef(GOOD_CDEF, 'Good CD', LM);
    const sc = importComponentFromDefinition(GOOD_CDEF, source.components![0]!);
    const ssp = createBlankSsp();
    ssp.metadata.title = 'Stale SSP';
    ssp.systemImplementation.components.push(sc);
    await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').create({
      uuid: ssp.uuid,
      type: 'systemSecurityPlan',
      origin: 'user',
      artifact: ssp,
    });
    // The source changes (→ stale) and loses its last-modified (→ not compliant).
    const changed = cdef(GOOD_CDEF, 'Good CD');
    changed.components![0]!.description = 'A changed component.';
    await d.update(GOOD_CDEF, changed);

    const user = userEvent.setup();
    renderAt(`/ssps/${ssp.uuid}/edit`, '/ssps/:uuid/edit', <SspEditorPage />);
    await user.click(await screen.findByTestId('ssp-section-implementation-toggle'));
    await user.click(await screen.findByTestId('si-component-summary'));
    await user.click(await screen.findByTestId('si-refresh-component'));
    await expectBlocked('Good CD');
    expect(screen.getByTestId('si-component-description-textarea')).toHaveValue('A component.');
  });
});

describe('G3 profile editor › add import', () => {
  it('refuses to import a non-compliant catalog', async () => {
    const user = userEvent.setup();
    renderAt('/profiles/new', '/profiles/new', <ProfileEditorPage />);
    await user.type(screen.getByTestId('profile-import-picker-input'), 'Catalog');
    await user.click(await screen.findByText('Broken Catalog'));
    await user.click(screen.getByTestId('profile-import-add'));
    await expectBlocked('Broken Catalog');
    expect(screen.queryAllByTestId('profile-import-item')).toHaveLength(0);
  });
});

describe('G4 profile assistant › source', () => {
  it('blocks a non-compliant source catalog and disables Create', async () => {
    const user = userEvent.setup();
    renderAt('/profiles/assistant', '/profiles/assistant', <ProfileCreationAssistantPage />);
    await user.type(screen.getByTestId('md-title'), 'P');
    await user.type(screen.getByTestId('profile-assistant-source-picker-input'), 'Catalog');
    await user.click(await screen.findByText('Broken Catalog'));
    await expectBlocked('Broken Catalog');
    expect(screen.getByTestId('profile-assistant-create')).toBeDisabled();
  });
});

describe('G5 component-definition editor › import-component-definition', () => {
  it('refuses a non-compliant component-definition import', async () => {
    const user = userEvent.setup();
    renderAt(
      '/component-definitions/new',
      '/component-definitions/new',
      <ComponentDefinitionEditorPage />,
    );
    await user.type(screen.getByTestId('cdef-import-picker-input'), 'CD');
    await user.click(await screen.findByText('Broken CD'));
    await user.click(screen.getByTestId('cdef-import-add'));
    await expectBlocked('Broken CD');
    expect(screen.queryAllByTestId('cdef-import-item')).toHaveLength(0);
  });
});

describe('G6 component-definition editor › control-implementation source', () => {
  it('refuses a non-compliant catalog as source', async () => {
    const user = userEvent.setup();
    renderAt(
      '/component-definitions/new',
      '/component-definitions/new',
      <ComponentDefinitionEditorPage />,
    );
    await user.click(screen.getByTestId('add-component'));
    await user.click(screen.getByTestId('add-control-implementation'));
    await user.type(screen.getByTestId('ci-source-input'), 'Catalog');
    await user.click(await screen.findByText('Broken Catalog'));
    await expectBlocked('Broken Catalog');
    expect(screen.queryByTestId('ci-source-resolved')).not.toBeInTheDocument();
  });
});

describe('G7 component-definition assistant › source', () => {
  it('blocks a non-compliant source: no requirement rows, Create disabled', async () => {
    const user = userEvent.setup();
    renderAt(
      '/component-definitions/assistant',
      '/component-definitions/assistant',
      <ComponentDefinitionAssistantPage />,
    );
    await user.type(screen.getByTestId('cdefa-component-title'), 'X');
    await user.type(screen.getByTestId('cdefa-source-picker-input'), 'Catalog');
    await user.click(await screen.findByText('Broken Catalog'));
    await expectBlocked('Broken Catalog');
    expect(screen.queryAllByTestId('cdefa-requirement-row')).toHaveLength(0);
    expect(screen.getByTestId('cdefa-create')).toBeDisabled();
  });
});

describe('G8 bootstrap assistant › baseline', () => {
  async function seedAsset() {
    await useAssetsStore
      .getState()
      .importCsvTrio(
        'uuid,title\nserver,Server\n',
        'asset-id,name,asset-type,description,security-sensitivity-level,information-types\nS001,Web,server,,normal,\n',
        'asset_type_uuid,targetobj_class_uuid\nserver,7e41ecf5-1831-4691-ad0c-4fc7bbc1b871\n',
      );
  }

  it('NIST/BSI: a non-compliant catalog baseline is blocked, Generate disabled', async () => {
    await act(async () => {
      await seedAsset();
    });
    const user = userEvent.setup();
    renderAt('/bootstrap', '/bootstrap', <BootstrapAssistantPage />);
    await waitFor(() => expect(screen.getByTestId('bootstrap-catalog-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('bootstrap-catalog-select'), BAD_CATALOG);
    await expectBlocked('Broken Catalog');
    expect(screen.getByTestId('bootstrap-generate')).toBeDisabled();
    await user.selectOptions(screen.getByTestId('bootstrap-catalog-select'), GOOD_CATALOG);
    await waitFor(() => expect(screen.getByTestId('bootstrap-generate')).toBeEnabled());
  });

  it('single-system: a non-compliant profile baseline is blocked; nothing is generated', async () => {
    await act(async () => {
      await seedAsset();
    });
    const user = userEvent.setup();
    renderAt('/bootstrap', '/bootstrap', <BootstrapAssistantPage />);
    await waitFor(() =>
      expect(screen.getByTestId('bootstrap-methodology-single-system')).toBeInTheDocument(),
    );
    await user.click(screen.getByTestId('bootstrap-methodology-single-system'));
    await user.selectOptions(screen.getByTestId('bootstrap-single-asset-select'), 'S001');
    await user.selectOptions(screen.getByTestId('bootstrap-single-source-select'), BAD_PROFILE);
    await expectBlocked('Broken Profile');
    expect(screen.getByTestId('bootstrap-generate')).toBeDisabled();
    expect(
      await ArtifactRepository.forType<SystemSecurityPlan>('systemSecurityPlan').getAll(),
    ).toHaveLength(0);
  });
});
