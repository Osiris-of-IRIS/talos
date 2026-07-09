/**
 * Catalog control resolution. Decision IDs: ADR-0001, ADR-0016, ADR-0021 (T-120).
 * Catalog fixture derived from BSI Stand-der-Technik-Bibliothek (CC-BY-SA-4.0). Covers
 * TEST-CATRES-01 and TEST-CTRLID-01.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { _resetDbForTests } from '@/data/db';
import { ArtifactRepository } from '@/data/artifactRepository';
import {
  indexCatalogControls,
  buildCatalogIndex,
  loadCatalogIndex,
  resolveControl,
  sourceToCatalogUuid,
  catalogSourceOptions,
  controlIdsForSource,
  paramsForControl,
  normalizeControlIdKey,
  findCatalogEntry,
  controlIdOptionsForSource,
  allControlIdOptions,
  resolveControlForSource,
} from '@/data/catalogResolution';
import { ensureCatalogSourceResource } from '@/models/backMatter';
import { parseOscalUpload } from '@/data/fileIo';
import type { Catalog } from '@/models/catalog';
import type { BackMatter, OscalArtifact } from '@/models/oscalBase';
import catalogJson from './catalog-minimal.json';

const catalogText = JSON.stringify(catalogJson);

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  _resetDbForTests();
});

describe('indexCatalogControls', () => {
  it('flattens grouped controls by id', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const index = indexCatalogControls(record.artifact);
    expect(index.has('ASST.1.1.2')).toBe(true);
    expect(index.get('ASST.1.1.2')?.title).toBe('Zuweisung');
  });
});

describe('buildCatalogIndex', () => {
  it('resolves a control id to its control + catalog', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([{ ...record, artifact: record.artifact }] as never);
    const r = resolveControl(idx, 'ASST.1.1.2');
    expect(r?.control.title).toBe('Zuweisung');
    expect(r?.catalogTitle).toBe('BSI Kernel (excerpt)');
  });

  it('returns undefined for an unknown control', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([record] as never);
    expect(resolveControl(idx, 'DOES.NOT.EXIST')).toBeUndefined();
  });
});

describe('source→catalog + param pickers (T-142)', () => {
  const build = () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    return { idx: buildCatalogIndex([record] as never), catalogUuid: record.uuid };
  };

  it('parses a source href into a catalog uuid', () => {
    expect(sourceToCatalogUuid('#abc')).toBe('abc');
    expect(sourceToCatalogUuid('abc')).toBe('abc');
    expect(sourceToCatalogUuid(undefined)).toBeUndefined();
    expect(sourceToCatalogUuid('')).toBeUndefined();
  });

  it('offers workspace catalogs as source options (ref = #uuid)', () => {
    const { idx, catalogUuid } = build();
    expect(catalogSourceOptions(idx)).toEqual([
      { ref: `#${catalogUuid}`, uuid: catalogUuid, title: 'BSI Kernel (excerpt)' },
    ]);
  });

  it('lists control-ids for a chosen source, and params for a chosen control', () => {
    const { idx, catalogUuid } = build();
    // The fixture control also carries an alt-identifier (ADR-0021), so it is indexed under
    // both its literal id and the `_{uuid}` form.
    const ids = controlIdsForSource(idx, `#${catalogUuid}`);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('ASST.1.1.2');
    expect(ids).toContain('_b3a2e5a0-380a-4770-86e6-ea1d8d586ad7');
    expect(paramsForControl(idx, `#${catalogUuid}`, 'ASST.1.1.2').map((p) => p.id)).toEqual([
      'asst.1.1.2-prm1',
    ]);
  });

  it('returns nothing for an unknown/free-text source (non-breaking fallback)', () => {
    const { idx } = build();
    expect(controlIdsForSource(idx, '#cat-1')).toEqual([]);
    expect(paramsForControl(idx, '#cat-1', 'ASST.1.1.2')).toEqual([]);
  });
});

describe('resolveControlForSource (UI feedback item 3 — CD editor 40/60 control display)', () => {
  it('resolves the control within the chosen source, incl. its library path', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([{ ...record, libraryPath: 'catalogs/kernel.json' }] as never);
    const resolved = resolveControlForSource(idx, `#${record.uuid}`, 'ASST.1.1.2');
    expect(resolved?.control.title).toBe('Zuweisung');
    expect(resolved?.catalogTitle).toBe('BSI Kernel (excerpt)');
    expect(resolved?.catalogLibraryPath).toBe('catalogs/kernel.json');
  });

  it('returns undefined for an unresolved source or unknown control-id', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([record] as never);
    expect(resolveControlForSource(idx, '#cat-1', 'ASST.1.1.2')).toBeUndefined();
    expect(resolveControlForSource(idx, undefined, 'ASST.1.1.2')).toBeUndefined();
  });
});

describe('back-matter-mediated source resolution (item 5, ADR-0024)', () => {
  const build = () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    return { idx: buildCatalogIndex([record] as never), catalogUuid: record.uuid };
  };

  it('resolves via a back-matter resource document-id, tried before the direct-uuid fallback', () => {
    const { idx, catalogUuid } = build();
    const holder: OscalArtifact = { uuid: 'x', metadata: { title: 't', version: '1', oscalVersion: '1.2.2' } };
    const resourceUuid = ensureCatalogSourceResource(holder, catalogUuid, 'BSI Kernel (excerpt)');

    const entry = findCatalogEntry(idx, `#${resourceUuid}`, holder.backMatter);
    expect(entry?.uuid).toBe(catalogUuid);
  });

  it('falls back to matching the resource title when no document-id matches a workspace catalog', () => {
    const { idx } = build();
    const backMatter: BackMatter = {
      resources: [{ uuid: 'res-1', title: 'BSI Kernel (excerpt)' }], // no documentIds
    };
    const entry = findCatalogEntry(idx, '#res-1', backMatter);
    expect(entry?.title).toBe('BSI Kernel (excerpt)');
  });

  it('falls back to the legacy direct-uuid match when no back-matter resource exists for the ref', () => {
    const { idx, catalogUuid } = build();
    // no backMatter passed at all — matches existing T-142 behavior unchanged
    const entry = findCatalogEntry(idx, `#${catalogUuid}`);
    expect(entry?.uuid).toBe(catalogUuid);
  });

  it('returns undefined when a resource exists but identifies nothing in the workspace', () => {
    const { idx } = build();
    const backMatter: BackMatter = { resources: [{ uuid: 'res-1', title: 'Some Unrelated Catalog' }] };
    expect(findCatalogEntry(idx, '#res-1', backMatter)).toBeUndefined();
  });
});

describe('alt-identifier resolution (ADR-0021, TEST-CTRLID-01)', () => {
  it('indexCatalogControls indexes a control under both its literal id and _{alt-identifier}', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const index = indexCatalogControls(record.artifact);
    expect(index.get('ASST.1.1.2')?.title).toBe('Zuweisung');
    expect(index.get('_b3a2e5a0-380a-4770-86e6-ea1d8d586ad7')?.title).toBe('Zuweisung');
  });

  it('resolveControl resolves the _{uuid} form to the same control as the literal id', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([record] as never);
    const byLiteral = resolveControl(idx, 'ASST.1.1.2');
    const byAltId = resolveControl(idx, '_b3a2e5a0-380a-4770-86e6-ea1d8d586ad7');
    expect(byAltId?.control).toBe(byLiteral?.control);
  });

  it('resolves the _{uuid} form case-insensitively', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([record] as never);
    expect(resolveControl(idx, '_B3A2E5A0-380A-4770-86E6-EA1D8D586AD7')?.control.title).toBe('Zuweisung');
  });

  it('returns undefined for a well-formed but non-matching _{uuid} reference', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([record] as never);
    expect(resolveControl(idx, '_00000000-0000-4000-8000-000000000000')).toBeUndefined();
  });

  it('paramsForControl resolves params when the requirement references the alt-identifier form', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([record] as never);
    const params = paramsForControl(idx, `#${record.uuid}`, '_b3a2e5a0-380a-4770-86e6-ea1d8d586ad7');
    expect(params.map((p) => p.id)).toEqual(['asst.1.1.2-prm1']);
  });

  it('normalizeControlIdKey lowercases only the _{uuid} form, leaving literal ids untouched', () => {
    expect(normalizeControlIdKey('_B3A2E5A0-380A-4770-86E6-EA1D8D586AD7')).toBe(
      '_b3a2e5a0-380a-4770-86e6-ea1d8d586ad7',
    );
    expect(normalizeControlIdKey('ASST.1.1.2')).toBe('ASST.1.1.2');
  });
});

describe('control-id typeahead richness (item 7, ADR-0024)', () => {
  it('controlIdOptionsForSource shows "{label|id} {title}" display text, id/alt-id as value', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([record] as never);
    const options = controlIdOptionsForSource(idx, `#${record.uuid}`);
    expect(options).toHaveLength(2);
    const literal = options.find((o) => o.value === 'ASST.1.1.2');
    expect(literal?.label).toBe('ASST.1.1.2 Zuweisung'); // fixture control has no "label" prop -> falls back to id
    const altId = options.find((o) => o.value === '_b3a2e5a0-380a-4770-86e6-ea1d8d586ad7');
    expect(altId?.label).toBe('ASST.1.1.2 Zuweisung'); // same control, same headline
  });

  it('allControlIdOptions is unscoped across every workspace catalog (SSPs have no per-requirement source)', () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    const idx = buildCatalogIndex([record] as never);
    const options = allControlIdOptions(idx);
    expect(options.map((o) => o.value)).toContain('ASST.1.1.2');
    expect(options.find((o) => o.value === 'ASST.1.1.2')?.label).toBe('ASST.1.1.2 Zuweisung');
  });
});

describe('loadCatalogIndex (IndexedDB)', () => {
  it('indexes catalogs stored in the workspace', async () => {
    const { record } = parseOscalUpload<Catalog>(catalogText);
    await ArtifactRepository.forType<Catalog>('catalog').create({
      uuid: record.uuid,
      type: 'catalog',
      origin: 'imported',
      artifact: record.artifact,
    });
    const idx = await loadCatalogIndex();
    expect(idx.catalogCount).toBe(1);
    expect(resolveControl(idx, 'ASST.1.1.2')?.control.title).toBe('Zuweisung');
  });
});
