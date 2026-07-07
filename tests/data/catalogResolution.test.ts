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
} from '@/data/catalogResolution';
import { parseOscalUpload } from '@/data/fileIo';
import type { Catalog } from '@/models/catalog';
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
