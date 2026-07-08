/**
 * Asset / asset-type / mapping CSV ingestion for the SSP-bootstrap assistant (ADR-0026).
 * Fixtures mirror tests/data/golden/recplast (the golden asset-list dataset).
 * Covers TEST-ASSET-01.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseAssetTypesCsv,
  parseAssetsCsv,
  parseAssetTypeMappingsCsv,
  applyAssetTypeMappings,
  crossCheckAssets,
} from '@/models/asset';

const GOLDEN_DIR = join(__dirname, '../data/golden/recplast');
function readGolden(name: string): string {
  return readFileSync(join(GOLDEN_DIR, name), 'utf-8');
}

const ASSET_TYPES_CSV = 'uuid,title\nclient-pc,Desktop-PC (Client)\nserver,Server (Hostsystem)\n';
const ASSETS_CSV =
  'uuid,name,asset_type,description,security-sensitivity-level,information-types\n' +
  'C001,Clients der Finanzbuchhaltung,client-pc,Desktop-PCs für Finanzbuchhaltung,erhöht,Finanzdaten\n' +
  'S001,Domänen-Controller,server,Active Directory Domänen-Controller,hoch,Identitätsdaten\n';
const MAPPINGS_CSV =
  'asset_type_uuid,targetobj_class_uuid\n' +
  'client-pc,837781a4-7b47-4695-9545-a3310eac7a66\n' +
  'server,19c946fc-e991-44ee-87c5-7bbe5d5aaf55\n';

describe('parseAssetTypesCsv', () => {
  it('parses uuid + title rows', () => {
    const types = parseAssetTypesCsv(ASSET_TYPES_CSV);
    expect(types).toEqual([
      { uuid: 'client-pc', title: 'Desktop-PC (Client)' },
      { uuid: 'server', title: 'Server (Hostsystem)' },
    ]);
  });

  it('throws on a row missing uuid or title', () => {
    expect(() => parseAssetTypesCsv('uuid,title\n,Desktop\n')).toThrow(/uuid/i);
    expect(() => parseAssetTypesCsv('uuid,title\nclient-pc,\n')).toThrow(/title/i);
  });
});

describe('parseAssetsCsv', () => {
  it('parses every column, mapping hyphenated headers to camelCase fields', () => {
    const assets = parseAssetsCsv(ASSETS_CSV);
    expect(assets).toEqual([
      {
        uuid: 'C001',
        name: 'Clients der Finanzbuchhaltung',
        assetType: 'client-pc',
        description: 'Desktop-PCs für Finanzbuchhaltung',
        securitySensitivityLevel: 'erhöht',
        informationTypes: 'Finanzdaten',
      },
      {
        uuid: 'S001',
        name: 'Domänen-Controller',
        assetType: 'server',
        description: 'Active Directory Domänen-Controller',
        securitySensitivityLevel: 'hoch',
        informationTypes: 'Identitätsdaten',
      },
    ]);
  });

  it('throws on a row missing uuid, name, or asset_type', () => {
    expect(() => parseAssetsCsv('uuid,name,asset_type\n,x,client-pc\n')).toThrow(/uuid/i);
    expect(() => parseAssetsCsv('uuid,name,asset_type\nC001,,client-pc\n')).toThrow(/name/i);
    expect(() => parseAssetsCsv('uuid,name,asset_type\nC001,x,\n')).toThrow(/asset_type/i);
  });
});

describe('parseAssetTypeMappingsCsv + applyAssetTypeMappings', () => {
  it('parses asset_type_uuid -> targetobj_class_uuid pairs into a map', () => {
    const map = parseAssetTypeMappingsCsv(MAPPINGS_CSV);
    expect(map.get('client-pc')).toBe('837781a4-7b47-4695-9545-a3310eac7a66');
    expect(map.get('server')).toBe('19c946fc-e991-44ee-87c5-7bbe5d5aaf55');
    expect(map.size).toBe(2);
  });

  it('merges the mapping into asset types as targetObjectCategoryUuid', () => {
    const types = parseAssetTypesCsv(ASSET_TYPES_CSV);
    const map = parseAssetTypeMappingsCsv(MAPPINGS_CSV);
    const merged = applyAssetTypeMappings(types, map);
    expect(merged.find((t) => t.uuid === 'client-pc')?.targetObjectCategoryUuid).toBe(
      '837781a4-7b47-4695-9545-a3310eac7a66',
    );
  });

  it('leaves an unmapped asset type with no targetObjectCategoryUuid', () => {
    const types = parseAssetTypesCsv('uuid,title\nservice-provider,Dienstleister\n');
    const merged = applyAssetTypeMappings(types, new Map());
    expect(merged[0]!.targetObjectCategoryUuid).toBeUndefined();
  });
});

describe('crossCheckAssets', () => {
  it('returns no problems when every asset references a known asset type', () => {
    const types = parseAssetTypesCsv(ASSET_TYPES_CSV);
    const assets = parseAssetsCsv(ASSETS_CSV);
    expect(crossCheckAssets(assets, types)).toEqual([]);
  });

  it('flags an asset referencing an unknown asset_type', () => {
    const types = parseAssetTypesCsv(ASSET_TYPES_CSV);
    const assets = parseAssetsCsv(
      'uuid,name,asset_type,description,security-sensitivity-level,information-types\n' +
        'X001,Ghost,unknown-type,,,\n',
    );
    const problems = crossCheckAssets(assets, types);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/X001/);
    expect(problems[0]).toMatch(/unknown-type/);
  });
});

describe('golden data (tests/data/golden/recplast)', () => {
  it('parses the real Recplast asset-list trio cleanly, fully cross-referenced', () => {
    const types = applyAssetTypeMappings(
      parseAssetTypesCsv(readGolden('asset_types.csv')),
      parseAssetTypeMappingsCsv(readGolden('mappings.csv')),
    );
    const assets = parseAssetsCsv(readGolden('assets.csv'));

    expect(types).toHaveLength(23);
    expect(assets).toHaveLength(94);
    expect(crossCheckAssets(assets, types)).toEqual([]);
    expect(types.every((t) => t.targetObjectCategoryUuid)).toBe(true);
  });
});
