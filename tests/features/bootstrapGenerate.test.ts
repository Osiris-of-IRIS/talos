/**
 * SSP-bootstrap pure generation (ADR-0026): NIST-style (one SSP per "system" asset, all catalog
 * controls) and BSI-style (one ISMS SSP for untagged controls + one SSP per mapped asset, filtered
 * by target-object-category ancestor chain). Uses the target-object-category-tagged fixture
 * catalog (tests/data/catalog-target-object-categories.json) and small, real-UUID asset fixtures.
 * Covers TEST-BOOTSTRAP-01.
 */
import { describe, it, expect } from 'vitest';
import { generateNist } from '@/features/bootstrap/generateNist';
import { generateBsi } from '@/features/bootstrap/generateBsi';
import { ISMS_CORRELATION_KEY, assetCorrelationKey, getBootstrapSource } from '@/features/bootstrap/bootstrapProvenance';
import type { Asset, AssetType } from '@/models/asset';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';
import type { Catalog } from '@/models/catalog';
import catalogDoc from '../data/catalog-target-object-categories.json';

const catalog = catalogDoc.catalog as unknown as Catalog;

const CATEGORY_ROWS: TargetObjectCategory[] = [
  { title: 'Anwendungen', definition: '', typ: 'Anwendungen', category: 'Technisch', synonyms: '', parentUuid: undefined, uuid: '7e41ecf5-1831-4691-ad0c-4fc7bbc1b871' },
  { title: 'Webserver', definition: '', typ: 'Anwendungen', category: 'Technisch', synonyms: '', parentUuid: '7e41ecf5-1831-4691-ad0c-4fc7bbc1b871', uuid: 'b1411d0f-ffd1-45b7-837b-cd97ba4ed9e7' },
  { title: 'Webanwendungen', definition: '', typ: 'Anwendungen', category: 'Technisch', synonyms: '', parentUuid: 'b1411d0f-ffd1-45b7-837b-cd97ba4ed9e7', uuid: '36cb0d6b-2f90-43bc-b625-9870112cf847' },
  { title: 'IT-Systeme', definition: '', typ: 'IT-Systeme', category: 'Technisch', synonyms: '', parentUuid: undefined, uuid: '427da6dd-d744-4b2b-88b7-f0a695f21e14' },
  { title: 'Hostsysteme', definition: '', typ: 'IT-Systeme', category: 'Technisch', synonyms: '', parentUuid: '427da6dd-d744-4b2b-88b7-f0a695f21e14', uuid: '19c946fc-e991-44ee-87c5-7bbe5d5aaf55' },
  { title: 'Endgeräte', definition: '', typ: 'IT-Systeme', category: 'Technisch', synonyms: '', parentUuid: '427da6dd-d744-4b2b-88b7-f0a695f21e14', uuid: '837781a4-7b47-4695-9545-a3310eac7a66' },
];

const ASSET_TYPES: AssetType[] = [
  { uuid: 'client-pc', title: 'Desktop-PC (Client)', targetObjectCategoryUuid: '837781a4-7b47-4695-9545-a3310eac7a66' }, // Endgeräte (IT-Systeme)
  { uuid: 'server', title: 'Server (Hostsystem)', targetObjectCategoryUuid: '19c946fc-e991-44ee-87c5-7bbe5d5aaf55' }, // Hostsysteme (IT-Systeme)
  { uuid: 'application-web', title: 'Webanwendung', targetObjectCategoryUuid: '36cb0d6b-2f90-43bc-b625-9870112cf847' }, // Webanwendungen (Anwendungen)
  { uuid: 'service-provider', title: 'Dienstleister', targetObjectCategoryUuid: '04d5e0fa-7b1a-48d5-b87c-1ee0060a4c2d' }, // Dienstleistungen (Einkäufe, no row -> unresolved)
];

const ASSETS: Asset[] = [
  { uuid: 'C001', name: 'Clients der Finanzbuchhaltung', assetType: 'client-pc', description: 'Desktop-PCs', securitySensitivityLevel: 'erhöht', informationTypes: 'Finanzdaten' },
  { uuid: 'S001', name: 'Domänen-Controller', assetType: 'server', description: 'AD-DC', securitySensitivityLevel: 'hoch', informationTypes: 'Identitätsdaten' },
  { uuid: 'A019', name: 'Webserver', assetType: 'application-web', description: 'Webserver-Software', securitySensitivityLevel: 'normal', informationTypes: 'Web-Inhalte' },
  { uuid: 'D001', name: 'Cloud-Provider', assetType: 'service-provider', description: 'Externer Dienstleister', securitySensitivityLevel: 'normal', informationTypes: '' },
];

const ALL_CONTROL_IDS = ['APP.1.1.1', 'APP.1.1.2', 'SYS.1.1.1', 'ISMS.1.1.1'];

describe('generateNist', () => {
  it('creates one SSP per "system"-typed asset (mapped category Typ === IT-Systeme), all catalog controls', () => {
    const { plans, warnings } = generateNist({ assets: ASSETS, assetTypes: ASSET_TYPES, categoryRows: CATEGORY_ROWS, catalog });

    const systemNames = plans.map((p) => p.systemCharacteristics.systemName).sort();
    expect(systemNames).toEqual(['Clients der Finanzbuchhaltung', 'Domänen-Controller']);

    for (const plan of plans) {
      const ids = plan.controlImplementation.implementedRequirements.map((r) => r.controlId).sort();
      expect(ids).toEqual([...ALL_CONTROL_IDS].sort());
    }
    expect(warnings.some((w) => w.includes('D001'))).toBe(true); // unresolved category
  });

  it('tags each generated SSP with a correlation key for idempotent re-run', () => {
    const { plans } = generateNist({ assets: ASSETS, assetTypes: ASSET_TYPES, categoryRows: CATEGORY_ROWS, catalog });
    const c001 = plans.find((p) => p.systemCharacteristics.systemName === 'Clients der Finanzbuchhaltung');
    expect(c001?.correlationKey).toBe(assetCorrelationKey('C001'));
    expect(getBootstrapSource(c001?.systemCharacteristics.props)).toBe(assetCorrelationKey('C001'));
  });
});

describe('generateBsi', () => {
  it('always creates a single ISMS SSP with only the untagged controls', () => {
    const { plans } = generateBsi({
      assets: [],
      assetTypes: ASSET_TYPES,
      categoryRows: CATEGORY_ROWS,
      catalog,
      ismsSystemName: 'ISMS',
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]!.correlationKey).toBe(ISMS_CORRELATION_KEY);
    expect(plans[0]!.controlImplementation.implementedRequirements.map((r) => r.controlId)).toEqual([
      'ISMS.1.1.1',
    ]);
  });

  it('creates one SSP per mapped asset, filtered to controls tagged with its category or an ancestor', () => {
    const { plans } = generateBsi({
      assets: ASSETS,
      assetTypes: ASSET_TYPES,
      categoryRows: CATEGORY_ROWS,
      catalog,
      ismsSystemName: 'ISMS',
    });

    const webserverPlan = plans.find((p) => p.correlationKey === assetCorrelationKey('A019'));
    expect(webserverPlan?.controlImplementation.implementedRequirements.map((r) => r.controlId).sort()).toEqual(
      ['APP.1.1.1', 'APP.1.1.2'], // Webanwendungen (direct) + Anwendungen (ancestor)
    );

    const serverPlan = plans.find((p) => p.correlationKey === assetCorrelationKey('S001'));
    expect(serverPlan?.controlImplementation.implementedRequirements.map((r) => r.controlId)).toEqual([
      'SYS.1.1.1', // Hostsysteme only
    ]);
  });

  it('warns and skips assets whose mapped category is not in the loaded hierarchy', () => {
    const { plans, warnings } = generateBsi({
      assets: ASSETS,
      assetTypes: ASSET_TYPES,
      categoryRows: CATEGORY_ROWS,
      catalog,
      ismsSystemName: 'ISMS',
    });
    expect(plans.some((p) => p.correlationKey === assetCorrelationKey('D001'))).toBe(false);
    expect(warnings.some((w) => w.includes('D001'))).toBe(true);
  });
});
