/**
 * Valid by construction (ADR-0040, PO decision backlog #3): what TALOS authors is OSCAL 1.2.3
 * compliant once the user has filled the required fields through the normal UI path.
 *  - Blank factories: only the fields a human must supply are reported (no empty required arrays,
 *    system-ids seeded, users not emitted).
 *  - SSP editor, component-definition assistant + editor, profile assistant + editor: the artifact
 *    saved after filling every required field validates against the vendored 1.2.3 schema.
 *  - Bootstrap: generated SSPs never crash validation; they are drafts flagged with exactly the
 *    fields bootstrap cannot know (components; information-types for the ISMS SSP).
 * Decision IDs: ADR-0001, ADR-0040, ADR-0026, ADR-0036, ADR-0032, ADR-0017.
 * Covers TEST-SCHEMA-06.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import { parseOscalUpload } from '@/data/fileIo';
import {
  checkArtifactCompliance,
  checkRecordCompliance,
  _resetComplianceForTests,
} from '@/data/complianceCheck';
import { ToastProvider } from '@/shared/toast';
import { createBlankSsp } from '@/features/ssps/blank';
import { createBlankProfile } from '@/features/profiles/blank';
import { createBlankComponentDefinition } from '@/features/componentDefinitions/blank';
import { SspEditorPage } from '@/features/ssps/SspEditorPage';
import { ComponentDefinitionAssistantPage } from '@/features/componentDefinitions/ComponentDefinitionAssistantPage';
import { ComponentDefinitionEditorPage } from '@/features/componentDefinitions/ComponentDefinitionEditorPage';
import { ProfileCreationAssistantPage } from '@/features/profiles/ProfileCreationAssistantPage';
import { ProfileEditorPage } from '@/features/profiles/ProfileEditorPage';
import { applyBootstrapPlans } from '@/features/bootstrap/applyPlans';
import { generateSingleSystem } from '@/features/bootstrap/generateSingleSystem';
import {
  buildControlImplementation,
  buildIsmsSystemCharacteristics,
} from '@/features/bootstrap/planBuilders';
import { ISMS_CORRELATION_KEY } from '@/features/bootstrap/bootstrapProvenance';
import type { ComplianceReport } from '@/models/compliance';
import type { StoredArtifact } from '@/data/db';
import type { SystemSecurityPlan } from '@/models/ssp';
import type { ComponentDefinition } from '@/models/componentDefinition';
import type { Profile } from '@/models/profile';
import type { Catalog } from '@/models/catalog';
import type { Asset } from '@/models/asset';
import catalogJson from '../data/catalog-minimal.json';
import cdefJson from '../data/component-definition-minimal.json';

const CATALOG_UUID = 'cccccccc-0000-4000-8000-000000000001';
const PROFILE_UUID = '9a9a9a9a-0000-4000-8000-000000000001';

function pointers(report: ComplianceReport): string[] {
  return report.issues.map((i) => `${i.pointer} ${i.code}`).sort();
}

async function seedValidCatalog() {
  const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
  await ArtifactRepository.forType<Catalog>('catalog').create(record);
}

async function seedValidProfile() {
  await ArtifactRepository.forType<Profile>('profile').create({
    uuid: PROFILE_UUID,
    type: 'profile',
    origin: 'user',
    artifact: {
      uuid: PROFILE_UUID,
      metadata: {
        title: 'Kernel Baseline',
        version: '1.0.0',
        oscalVersion: '1.2.3',
        lastModified: '2026-11-19T10:00:00Z',
      },
      imports: [{ href: `#${CATALOG_UUID}`, includeAll: {} }],
      merge: { asIs: true },
    },
  });
}

async function seedValidComponentDefinition() {
  const { record } = parseOscalUpload<ComponentDefinition>(JSON.stringify(cdefJson));
  await ArtifactRepository.forType<ComponentDefinition>('componentDefinition').create(record);
}

function renderRoutes(path: string, routes: [string, JSX.Element][]) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {routes.map(([p, el]) => (
            <Route key={p} path={p} element={el} />
          ))}
          <Route path="*" element={<div data-testid="landed" />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

async function onlyRecord<T>(
  type: 'systemSecurityPlan' | 'componentDefinition' | 'profile',
): Promise<StoredArtifact<T>> {
  const all = await ArtifactRepository.forType<T>(type).getAll();
  expect(all).toHaveLength(1);
  return all[0]!;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
  _resetComplianceForTests();
});

afterEach(() => {
  // @ts-expect-error test-only cleanup of the global override
  delete globalThis.confirm;
});

describe('blank factories report only what a human must supply', () => {
  it('SSP: title, system name, information types, components, implemented requirements', async () => {
    const blank = createBlankSsp();
    expect(blank.systemCharacteristics.systemIds).toHaveLength(1);
    expect(blank.systemCharacteristics.systemIds[0]).toEqual({
      identifierType: 'http://datatracker.ietf.org/doc/html/rfc4122',
      id: blank.uuid,
    });
    expect(blank.systemImplementation.users).toBeUndefined();
    const report = await checkArtifactCompliance('systemSecurityPlan', blank);
    const root = '/system-security-plan';
    expect(pointers(report)).toEqual(
      [
        `${root}/metadata/title empty`,
        `${root}/system-characteristics/system-name empty`,
        `${root}/system-characteristics/system-information/information-types required`,
        `${root}/system-implementation/components required`,
        `${root}/control-implementation/implemented-requirements required`,
      ].sort(),
    );
  });

  it('profile: title and at least one import', async () => {
    const report = await checkArtifactCompliance('profile', createBlankProfile());
    expect(pointers(report)).toEqual([
      '/profile/imports required',
      '/profile/metadata/title empty',
    ]);
  });

  it('component-definition: only the title (components are optional and not emitted empty)', async () => {
    const report = await checkArtifactCompliance(
      'componentDefinition',
      createBlankComponentDefinition(),
    );
    expect(pointers(report)).toEqual(['/component-definition/metadata/title empty']);
  });
});

describe('editors and assistants produce compliant artifacts once required fields are filled', () => {
  it('SSP editor: title, system name, system id (seeded), information type, profile, component', async () => {
    await seedValidCatalog();
    await seedValidProfile();
    await seedValidComponentDefinition();
    globalThis.confirm = () => true;
    const user = userEvent.setup();
    renderRoutes('/ssps/new', [['/ssps/new', <SspEditorPage />]]);

    await user.type(screen.getByTestId('md-title'), 'Webshop SSP');
    await user.type(screen.getByTestId('sc-system-name'), 'Webshop');
    expect(screen.getAllByTestId('sc-system-id-row')).toHaveLength(1);
    await user.click(screen.getByTestId('sc-add-information-type'));
    await user.type(screen.getByTestId('sc-information-type-title'), 'Kundendaten');
    await user.type(
      screen.getByTestId('sc-information-type-description-textarea'),
      'Bestellungen und Adressen.',
    );

    await user.type(screen.getByTestId('ssp-import-profile-input'), 'Kernel');
    await user.click(await screen.findByText('Kernel Baseline'));
    await waitFor(() =>
      expect(screen.getByTestId('ssp-import-profile-resolved')).toBeInTheDocument(),
    );

    await waitFor(() => expect(screen.getByTestId('si-cd-select')).toBeInTheDocument());
    await user.selectOptions(screen.getByTestId('si-cd-select'), 'Passwortrichtlinie');
    await user.selectOptions(screen.getByTestId('si-component-select'), 'Password Policy');
    await waitFor(() => expect(screen.getByTestId('si-import')).toBeEnabled());
    await user.click(screen.getByTestId('si-import'));
    await waitFor(() => expect(screen.getAllByTestId('si-component')).toHaveLength(1));

    await user.click(screen.getByTestId('save-ssp'));
    await waitFor(() => expect(screen.getByTestId('landed')).toBeInTheDocument());
    const report = await checkRecordCompliance(
      await onlyRecord<SystemSecurityPlan>('systemSecurityPlan'),
    );
    expect(report.issues).toEqual([]);
    expect(report.status).toBe('compliant');
  });

  it('component-definition assistant writes every required implemented-requirement description', async () => {
    await seedValidCatalog();
    const user = userEvent.setup();
    renderRoutes('/component-definitions/assistant', [
      ['/component-definitions/assistant', <ComponentDefinitionAssistantPage />],
    ]);

    await user.type(screen.getByTestId('cdefa-component-title'), 'Firewall');
    await user.type(screen.getByTestId('cdefa-source-picker-input'), 'BSI');
    await user.click(await screen.findByText('BSI Kernel (excerpt)'));
    await waitFor(() =>
      expect(screen.getAllByTestId('cdefa-requirement-row').length).toBeGreaterThan(0),
    );
    await user.click(screen.getByTestId('cdefa-create'));
    await waitFor(() => expect(screen.getByTestId('landed')).toBeInTheDocument());

    const record = await onlyRecord<ComponentDefinition>('componentDefinition');
    const irs = record.artifact.components![0]!.controlImplementations![0]!.implementedRequirements;
    expect(irs.every((ir) => typeof ir.description === 'string')).toBe(true);
    const report = await checkRecordCompliance(record);
    expect(report.issues).toEqual([]);
  });

  it('component-definition editor: title + one component with a type', async () => {
    const user = userEvent.setup();
    renderRoutes('/component-definitions/new', [
      ['/component-definitions/new', <ComponentDefinitionEditorPage />],
    ]);
    await user.type(screen.getByTestId('md-title'), 'Komponenten');
    await user.click(screen.getByTestId('add-component'));
    await user.type(screen.getByTestId('component-title'), 'Webserver');
    await user.click(screen.getByTestId('save-compdef'));
    await waitFor(() => expect(screen.getByTestId('landed')).toBeInTheDocument());
    const report = await checkRecordCompliance(
      await onlyRecord<ComponentDefinition>('componentDefinition'),
    );
    expect(report.issues).toEqual([]);
  });

  it('profile assistant: title + compliant source', async () => {
    await seedValidCatalog();
    const user = userEvent.setup();
    renderRoutes('/profiles/assistant', [
      ['/profiles/assistant', <ProfileCreationAssistantPage />],
    ]);
    await user.type(screen.getByTestId('md-title'), 'Mein Profil');
    await user.type(screen.getByTestId('profile-assistant-source-picker-input'), 'BSI');
    await user.click(await screen.findByText('BSI Kernel (excerpt)'));
    await waitFor(() => expect(screen.getByTestId('profile-assistant-create')).toBeEnabled());
    await user.click(screen.getByTestId('profile-assistant-create'));
    await waitFor(() => expect(screen.getByTestId('landed')).toBeInTheDocument());
    const report = await checkRecordCompliance(await onlyRecord<Profile>('profile'));
    expect(report.issues).toEqual([]);
  });

  it('profile editor: title + one import of a compliant catalog', async () => {
    await seedValidCatalog();
    const user = userEvent.setup();
    renderRoutes('/profiles/new', [['/profiles/new', <ProfileEditorPage />]]);
    await user.type(screen.getByTestId('md-title'), 'Handprofil');
    await user.type(screen.getByTestId('profile-import-picker-input'), 'BSI');
    await user.click(await screen.findByText('BSI Kernel (excerpt)'));
    await user.click(screen.getByTestId('profile-import-add'));
    await waitFor(() => expect(screen.getAllByTestId('profile-import-item')).toHaveLength(1));
    await user.click(screen.getByTestId('save-profile'));
    await waitFor(() => expect(screen.getByTestId('landed')).toBeInTheDocument());
    const report = await checkRecordCompliance(await onlyRecord<Profile>('profile'));
    expect(report.issues).toEqual([]);
  });
});

describe('bootstrap-generated SSPs are validated like any draft (no crash)', () => {
  const ASSET: Asset = {
    assetId: 'S001',
    name: 'Webserver',
    assetType: 'server',
    description: 'Public web server',
    securitySensitivityLevel: 'normal',
    informationTypes: 'Kundendaten',
  };

  it('single-system SSP: system-ids seeded; only components are missing', async () => {
    const { record } = parseOscalUpload<Catalog>(JSON.stringify(catalogJson));
    const { plans } = generateSingleSystem({
      asset: ASSET,
      assetType: undefined,
      source: { type: 'catalog', catalog: record.artifact },
      catalogs: [record],
      profiles: [],
    });
    await applyBootstrapPlans(plans);
    const ssp = await onlyRecord<SystemSecurityPlan>('systemSecurityPlan');
    expect(ssp.artifact.systemCharacteristics.systemIds.length).toBeGreaterThan(0);
    const report = await checkRecordCompliance(ssp);
    expect(pointers(report)).toEqual([
      '/system-security-plan/system-implementation/components required',
    ]);
  });

  it('system-ids stay stable across a bootstrap re-run', async () => {
    const plan = {
      correlationKey: ISMS_CORRELATION_KEY,
      systemCharacteristics: buildIsmsSystemCharacteristics('ISMS', ISMS_CORRELATION_KEY),
      controlImplementation: buildControlImplementation('ISMS', [{ id: 'ASST.1.1.2', title: 'x' }]),
    };
    await applyBootstrapPlans([plan]);
    const first = (await onlyRecord<SystemSecurityPlan>('systemSecurityPlan')).artifact
      .systemCharacteristics.systemIds;
    await applyBootstrapPlans([
      {
        ...plan,
        systemCharacteristics: buildIsmsSystemCharacteristics('ISMS', ISMS_CORRELATION_KEY),
      },
    ]);
    const ssp = await onlyRecord<SystemSecurityPlan>('systemSecurityPlan');
    expect(ssp.artifact.systemCharacteristics.systemIds).toEqual(first);
    const report = await checkRecordCompliance(ssp);
    expect(pointers(report)).toEqual([
      '/system-security-plan/system-characteristics/system-information/information-types required',
      '/system-security-plan/system-implementation/components required',
    ]);
  });
});
