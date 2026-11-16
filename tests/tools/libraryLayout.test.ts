/**
 * BSI library layout classifier + bundled index integrity (ADR-0039, ADR-0005). The paths and
 * profile rlinks below are the real upstream values of BSI-Bund/Stand-der-Technik-Bibliothek
 * `main` @ c3f3785 (2026-10-30), the commit the bundled index was generated from.
 * Decision IDs: ADR-0001, ADR-0005, ADR-0039.
 * Covers TEST-LIB-04.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyLibraryFile,
  referencedCatalogPaths,
  buildLibraryIndex,
  findNamespacePaths,
  libraryCheckTargets,
  encodeRepoPath,
} from '../../tools/libraryLayout.mjs';
import manifest from '@/data/library-index.json';

const GSPP_PROFILE = 'control_layer/Grundschutz++/sources/profiles/Grundschutz++-profile.json';
const gsppProfileDoc = {
  profile: {
    imports: [{ href: '#m' }, { href: '#r' }, { href: '#k' }],
    'back-matter': {
      resources: [
        { uuid: 'x', rlinks: [{ href: 'https://www.bsi.bund.de/some-page.html' }] },
        { uuid: 'm', rlinks: [{ href: '../catalogs/Methodik-Grundschutz++/BSI-Methodik-Grundschutz++-catalog.json' }] },
        { uuid: 'r', rlinks: [{ href: '../../../Risikomanagement/BSI-Anforderungen-zum-Risikomanagement-catalog.json' }] },
        { uuid: 'k', rlinks: [{ href: '../../../Kernel/BSI-Stand-der-Technik-Kernel-catalog.json' }] },
      ],
    },
  },
};

const FILES = [
  'README.md',
  'assessment_layer/README.md',
  'control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json',
  'control_layer/Grundschutz++/sources/catalogs/Methodik-Grundschutz++/BSI-Methodik-Grundschutz++-catalog.json',
  GSPP_PROFILE,
  'control_layer/Kernel/BSI-Stand-der-Technik-Kernel-catalog.json',
  'control_layer/Mappings/ISO-27001-zu-GSpp/ISO27001-AnnexA-to-GS++-mapping_collection.json',
  'control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json',
  'control_layer/Risikomanagement/BSI-Anforderungen-zum-Risikomanagement-catalog.json',
  'documentation/datamodel/oscal_satzschablone_schema.json',
  'documentation/namespaces/basethreats.csv',
  'documentation/namespaces/target_object_categories.csv',
  'implementation_layer/AWS Beispiel-Components/AWS Security Hub-component_definition.json',
  'implementation_layer/Keycloak/Keycloak-component_definition.json',
].map((path, i) => ({ path, sha: i.toString(16).padStart(40, 'a'), size: 100 + i }));

describe('classifyLibraryFile (TEST-LIB-04)', () => {
  it('maps the new BSI layout suffixes to OSCAL artifact types', () => {
    expect(classifyLibraryFile('control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json')).toMatchObject({
      artifactType: 'catalog',
      resolved: true,
    });
    expect(classifyLibraryFile('control_layer/Kernel/BSI-Stand-der-Technik-Kernel-catalog.json')).toMatchObject({
      artifactType: 'catalog',
      resolved: false,
    });
    expect(classifyLibraryFile(GSPP_PROFILE)?.artifactType).toBe('profile');
    expect(
      classifyLibraryFile('implementation_layer/Keycloak/Keycloak-component_definition.json')?.artifactType,
    ).toBe('component-definition');
    expect(
      classifyLibraryFile('control_layer/Mappings/ISO-27001-zu-GSpp/ISO27001-AnnexA-to-GS++-mapping_collection.json')
        ?.artifactType,
    ).toBe('mapping-collection');
    // Anticipated assessment-layer artifacts (none published yet upstream).
    expect(classifyLibraryFile('assessment_layer/X/X-assessment_plan.json')?.artifactType).toBe('assessment-plan');
  });

  it('ignores documentation, schemas and anything outside the OSCAL layers', () => {
    expect(classifyLibraryFile('README.md')).toBeNull();
    expect(classifyLibraryFile('documentation/datamodel/oscal_satzschablone_schema.json')).toBeNull();
    expect(classifyLibraryFile('documentation/namespaces/basethreats.csv')).toBeNull();
    expect(classifyLibraryFile('Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json')).toBeNull();
  });
});

describe('referencedCatalogPaths (TEST-LIB-04)', () => {
  it('resolves relative profile rlinks to repo paths and ignores absolute URLs', () => {
    expect(referencedCatalogPaths(GSPP_PROFILE, gsppProfileDoc).sort()).toEqual([
      'control_layer/Grundschutz++/sources/catalogs/Methodik-Grundschutz++/BSI-Methodik-Grundschutz++-catalog.json',
      'control_layer/Kernel/BSI-Stand-der-Technik-Kernel-catalog.json',
      'control_layer/Risikomanagement/BSI-Anforderungen-zum-Risikomanagement-catalog.json',
    ]);
  });

  it('tolerates a profile without back-matter', () => {
    expect(referencedCatalogPaths(GSPP_PROFILE, { profile: { imports: [] } })).toEqual([]);
  });
});

describe('buildLibraryIndex (TEST-LIB-04)', () => {
  const index = buildLibraryIndex({
    files: FILES,
    profiles: new Map([[GSPP_PROFILE, gsppProfileDoc]]),
    source: 'https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek',
    ref: 'main',
    commit: 'c3f37859fdf302394de39e89252eb3e72a45953c',
    generatedAt: '2026-11-16T00:00:00Z',
  });
  const byPath = new Map(index.entries.map((e: { path: string }) => [e.path, e]));

  it('classifies resolved catalogs and standalone catalogs as Anwenderkatalog', () => {
    expect(byPath.get('control_layer/Grundschutz++/Grundschutz++-resolved_catalog.json')).toMatchObject({
      category: 'Anwenderkatalog',
      title: 'Grundschutz++',
    });
    expect(byPath.get('control_layer/Mindeststandard-TLS/Entwurf-Mindeststandard-TLS-catalog.json')).toMatchObject({
      category: 'Anwenderkatalog',
    });
  });

  it('classifies catalogs a profile imports as Quellkatalog', () => {
    for (const p of [
      'control_layer/Kernel/BSI-Stand-der-Technik-Kernel-catalog.json',
      'control_layer/Risikomanagement/BSI-Anforderungen-zum-Risikomanagement-catalog.json',
      'control_layer/Grundschutz++/sources/catalogs/Methodik-Grundschutz++/BSI-Methodik-Grundschutz++-catalog.json',
    ]) {
      expect(byPath.get(p)).toMatchObject({ category: 'Quellkatalog', artifactType: 'catalog' });
    }
  });

  it('lists profiles, component-definitions and mapping collections under their own categories', () => {
    expect(byPath.get(GSPP_PROFILE)).toMatchObject({ category: 'Profil', artifactType: 'profile' });
    expect(byPath.get('implementation_layer/Keycloak/Keycloak-component_definition.json')).toMatchObject({
      category: 'Komponente',
      title: 'Keycloak',
    });
    expect(
      byPath.get('implementation_layer/AWS Beispiel-Components/AWS Security Hub-component_definition.json'),
    ).toMatchObject({ title: 'AWS Security Hub' });
    expect(
      byPath.get('control_layer/Mappings/ISO-27001-zu-GSpp/ISO27001-AnnexA-to-GS++-mapping_collection.json'),
    ).toMatchObject({ category: 'Mapping', artifactType: 'mapping-collection' });
  });

  it('carries real shas/sizes, the generating commit and the namespace CSV paths', () => {
    expect(index.commit).toBe('c3f37859fdf302394de39e89252eb3e72a45953c');
    expect(index.ref).toBe('main');
    expect(index.namespaces).toEqual({
      targetObjectCategories: 'documentation/namespaces/target_object_categories.csv',
      threats: 'documentation/namespaces/basethreats.csv',
    });
    expect(byPath.has('README.md')).toBe(false);
    expect(index.entries.every((e: { sha: string; size: number }) => /^[0-9a-f]{40}$/.test(e.sha) && e.size > 0)).toBe(
      true,
    );
  });

  it('fails loudly when a namespace CSV cannot be found in the tree', () => {
    expect(() => findNamespacePaths(FILES.filter((f) => !f.path.endsWith('basethreats.csv')))).toThrow(
      /basethreats\.csv/,
    );
  });
});

describe('libraryCheckTargets + encodeRepoPath (TEST-LIB-04)', () => {
  it('percent-encodes spaces and plus signs per path segment', () => {
    expect(encodeRepoPath('implementation_layer/AWS Beispiel-Components/AWS Security Hub-component_definition.json')).toBe(
      'implementation_layer/AWS%20Beispiel-Components/AWS%20Security%20Hub-component_definition.json',
    );
    expect(encodeRepoPath('control_layer/Grundschutz++/x.json')).toBe('control_layer/Grundschutz%2B%2B/x.json');
  });

  it('lists every index entry plus both namespace CSVs', () => {
    const targets = libraryCheckTargets(manifest, 'https://raw.example/main/');
    expect(targets).toHaveLength(manifest.entries.length + 2);
    expect(targets.every((t: { url: string }) => t.url.startsWith('https://raw.example/main/'))).toBe(true);
  });
});

describe('bundled library-index.json (TEST-LIB-04)', () => {
  it('only references the new upstream layout, with real shas (no placeholders)', () => {
    expect(manifest.entries.length).toBeGreaterThanOrEqual(15);
    for (const e of manifest.entries) {
      expect(e.path).toMatch(/^(control_layer|implementation_layer|assessment_layer)\//);
      expect(e.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(e.sha).not.toMatch(/^0+\d$/);
      expect(e.size).toBeGreaterThan(0);
    }
    expect(manifest.namespaces.targetObjectCategories).toBe('documentation/namespaces/target_object_categories.csv');
    expect(manifest.namespaces.threats).toBe('documentation/namespaces/basethreats.csv');
  });

  it('contains the Grundschutz++ user catalog, Kernel source catalog and the Keycloak component', () => {
    const titles = new Map(manifest.entries.map((e) => [e.title + '|' + e.category, e]));
    expect(titles.has('Grundschutz++|Anwenderkatalog')).toBe(true);
    expect(titles.has('BSI Stand der Technik Kernel|Quellkatalog')).toBe(true);
    expect(titles.has('Keycloak|Komponente')).toBe(true);
  });
});
