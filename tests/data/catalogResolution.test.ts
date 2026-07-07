/**
 * Catalog control resolution. Decision IDs: ADR-0001, ADR-0016 (T-120).
 * Catalog fixture derived from BSI Stand-der-Technik-Bibliothek (CC-BY-SA-4.0). Covers TEST-CATRES-01.
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
    expect(controlIdsForSource(idx, `#${catalogUuid}`)).toEqual(['ASST.1.1.2']);
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
