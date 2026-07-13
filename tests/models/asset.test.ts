/**
 * Asset / asset-type / mapping CSV+JSON ingestion for the SSP-bootstrap assistant
 * (ADR-0026, ADR-0031). Fixtures mirror tests/data/golden/recplast (the golden asset-list dataset).
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
  serializeAssetsCsv,
  serializeAssetWorkspaceJson,
  parseAssetWorkspaceJson,
  type Asset,
} from '@/models/asset';

const GOLDEN_DIR = join(__dirname, '../data/golden/recplast');
function readGolden(name: string): string {
  return readFileSync(join(GOLDEN_DIR, name), 'utf-8');
}

const ASSET_TYPES_CSV =
  'uuid,title,oscal-asset-type\n' +
  'client-pc,Desktop-PC (Client),\n' +
  'server,Server (Hostsystem),\n' +
  'network-router,Router,router\n';
const ASSETS_CSV_HEADER =
  'asset-id,name,asset-type,description,security-sensitivity-level,information-types,' +
  'ipv4-address,ipv6-address,fqdn,netbios-name,mac-address,serial-number,physical-location,vendor-name,uri,is-scanned';
const ASSETS_CSV =
  ASSETS_CSV_HEADER +
  '\n' +
  'C001,Clients der Finanzbuchhaltung,client-pc,Desktop-PCs für Finanzbuchhaltung,erhöht,Finanzdaten,' +
  '10.10.1.11,,,PC-FIBU-01,AA:BB:CC:00:01:11,,Bad Godesberg,Dell,,yes\n' +
  'S001,Domänen-Controller,server,Active Directory Domänen-Controller,hoch,Identitätsdaten,' +
  '10.10.9.11,,dc01.recplast.internal,DC01,AA:BB:CC:00:09:11,SN-DC01,Bad Godesberg,Dell PowerEdge,,yes\n';
const MAPPINGS_CSV =
  'asset_type_uuid,targetobj_class_uuid\n' +
  'client-pc,837781a4-7b47-4695-9545-a3310eac7a66\n' +
  'server,19c946fc-e991-44ee-87c5-7bbe5d5aaf55\n' +
  'network-router,a9521914-ccf9-4c20-8eef-2dd912fb815d\n';

function minimalAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    assetId: 'C001',
    name: 'Clients der Finanzbuchhaltung',
    assetType: 'client-pc',
    description: '',
    securitySensitivityLevel: 'normal',
    informationTypes: '',
    ipv4Address: undefined,
    ipv6Address: undefined,
    fqdn: undefined,
    netbiosName: undefined,
    macAddress: undefined,
    serialNumber: undefined,
    physicalLocation: undefined,
    vendorName: undefined,
    uri: undefined,
    isScanned: undefined,
    ...overrides,
  };
}

describe('parseAssetTypesCsv', () => {
  it('parses uuid + title rows, with oscal-asset-type omitted when blank', () => {
    const types = parseAssetTypesCsv(ASSET_TYPES_CSV);
    expect(types).toEqual([
      { uuid: 'client-pc', title: 'Desktop-PC (Client)' },
      { uuid: 'server', title: 'Server (Hostsystem)' },
      { uuid: 'network-router', title: 'Router', oscalAssetType: 'router' },
    ]);
  });

  it('throws on a row missing uuid or title', () => {
    expect(() => parseAssetTypesCsv('uuid,title\n,Desktop\n')).toThrow(/uuid/i);
    expect(() => parseAssetTypesCsv('uuid,title\nclient-pc,\n')).toThrow(/title/i);
  });

  it('tolerates a file with no oscal-asset-type column at all', () => {
    const types = parseAssetTypesCsv('uuid,title\nclient-pc,Desktop-PC (Client)\n');
    expect(types).toEqual([{ uuid: 'client-pc', title: 'Desktop-PC (Client)' }]);
  });
});

describe('parseAssetsCsv', () => {
  it('parses every column, mapping hyphenated headers to camelCase fields (ADR-0031 rename + new columns)', () => {
    const assets = parseAssetsCsv(ASSETS_CSV);
    expect(assets).toEqual([
      minimalAsset({
        assetId: 'C001',
        name: 'Clients der Finanzbuchhaltung',
        assetType: 'client-pc',
        description: 'Desktop-PCs für Finanzbuchhaltung',
        securitySensitivityLevel: 'erhöht',
        informationTypes: 'Finanzdaten',
        ipv4Address: '10.10.1.11',
        netbiosName: 'PC-FIBU-01',
        macAddress: 'AA:BB:CC:00:01:11',
        physicalLocation: 'Bad Godesberg',
        vendorName: 'Dell',
        isScanned: 'yes',
      }),
      minimalAsset({
        assetId: 'S001',
        name: 'Domänen-Controller',
        assetType: 'server',
        description: 'Active Directory Domänen-Controller',
        securitySensitivityLevel: 'hoch',
        informationTypes: 'Identitätsdaten',
        ipv4Address: '10.10.9.11',
        fqdn: 'dc01.recplast.internal',
        netbiosName: 'DC01',
        macAddress: 'AA:BB:CC:00:09:11',
        serialNumber: 'SN-DC01',
        physicalLocation: 'Bad Godesberg',
        vendorName: 'Dell PowerEdge',
        isScanned: 'yes',
      }),
    ]);
  });

  it('throws on a row missing asset-id, name, or asset-type', () => {
    expect(() => parseAssetsCsv('asset-id,name,asset-type\n,x,client-pc\n')).toThrow(/asset-id/i);
    expect(() => parseAssetsCsv('asset-id,name,asset-type\nC001,,client-pc\n')).toThrow(/name/i);
    expect(() => parseAssetsCsv('asset-id,name,asset-type\nC001,x,\n')).toThrow(/asset-type/i);
  });

  it('tolerates a file with none of the new optional columns', () => {
    const assets = parseAssetsCsv(
      'asset-id,name,asset-type,description,security-sensitivity-level,information-types\n' +
        'C001,Clients,client-pc,,normal,\n',
    );
    expect(assets).toEqual([minimalAsset({ name: 'Clients', securitySensitivityLevel: 'normal' })]);
    expect(assets[0]!.ipv4Address).toBeUndefined();
  });
});

describe('parseAssetTypeMappingsCsv + applyAssetTypeMappings', () => {
  it('parses asset_type_uuid -> targetobj_class_uuid pairs into a map', () => {
    const map = parseAssetTypeMappingsCsv(MAPPINGS_CSV);
    expect(map.get('client-pc')).toBe('837781a4-7b47-4695-9545-a3310eac7a66');
    expect(map.get('server')).toBe('19c946fc-e991-44ee-87c5-7bbe5d5aaf55');
    expect(map.size).toBe(3);
  });

  it('merges the mapping into asset types as targetObjectCategoryUuid, preserving oscalAssetType', () => {
    const types = parseAssetTypesCsv(ASSET_TYPES_CSV);
    const map = parseAssetTypeMappingsCsv(MAPPINGS_CSV);
    const merged = applyAssetTypeMappings(types, map);
    expect(merged.find((t) => t.uuid === 'client-pc')?.targetObjectCategoryUuid).toBe(
      '837781a4-7b47-4695-9545-a3310eac7a66',
    );
    expect(merged.find((t) => t.uuid === 'network-router')).toEqual({
      uuid: 'network-router',
      title: 'Router',
      oscalAssetType: 'router',
      targetObjectCategoryUuid: 'a9521914-ccf9-4c20-8eef-2dd912fb815d',
    });
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

  it('flags an asset referencing an unknown asset-type, by asset-id', () => {
    const types = parseAssetTypesCsv(ASSET_TYPES_CSV);
    const assets = parseAssetsCsv(`${ASSETS_CSV_HEADER}\nX001,Ghost,unknown-type\n`);
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

    expect(types).toHaveLength(26);
    expect(assets).toHaveLength(97);
    expect(crossCheckAssets(assets, types)).toEqual([]);
    expect(types.every((t) => t.targetObjectCategoryUuid)).toBe(true);
  });

  it('aligns asset-type to the NIST enum only where a clean match exists (ADR-0031)', () => {
    const types = parseAssetTypesCsv(readGolden('asset_types.csv'));
    const byUuid = new Map(types.map((t) => [t.uuid, t]));
    expect(byUuid.get('network-router')?.oscalAssetType).toBe('router');
    expect(byUuid.get('network-switch')?.oscalAssetType).toBe('switch');
    expect(byUuid.get('network-firewall')?.oscalAssetType).toBe('firewall');
    expect(byUuid.get('application-database')?.oscalAssetType).toBe('database');
    expect(byUuid.get('application-web')?.oscalAssetType).toBe('web-server');
    // No honest NIST equivalent for these — must stay unaligned (fall back to their own title).
    expect(byUuid.get('client-pc')?.oscalAssetType).toBeUndefined();
    expect(byUuid.get('room-office')?.oscalAssetType).toBeUndefined();
    expect(byUuid.get('service-provider')?.oscalAssetType).toBeUndefined();
  });

  it('populates optional inventory props only where physically plausible per asset-type', () => {
    const assets = parseAssetsCsv(readGolden('assets.csv'));
    const byId = new Map(assets.map((a) => [a.assetId, a]));
    // A server: IP/hostname/serial all plausible.
    expect(byId.get('S001')?.ipv4Address).toBeTruthy();
    expect(byId.get('S001')?.macAddress).toBeTruthy();
    // A room has no network identity.
    expect(byId.get('R001')?.ipv4Address).toBeUndefined();
    expect(byId.get('R001')?.macAddress).toBeUndefined();
    expect(byId.get('R001')?.physicalLocation).toBeTruthy();
    // A service provider is external, not a network-attached asset.
    expect(byId.get('D001')?.ipv4Address).toBeUndefined();
  });
});

describe('serializeAssetsCsv', () => {
  it('round-trips through parseAssetsCsv unchanged', () => {
    const assets = parseAssetsCsv(ASSETS_CSV);
    expect(parseAssetsCsv(serializeAssetsCsv(assets))).toEqual(assets);
  });

  it('quotes fields containing commas (e.g. a name with an embedded comma)', () => {
    const csv = serializeAssetsCsv([minimalAsset({ name: 'Finance, Süd' })]);
    expect(csv).toContain('"Finance, Süd"');
  });

  it('round-trips the full golden Recplast dataset', () => {
    const assets = parseAssetsCsv(readGolden('assets.csv'));
    expect(parseAssetsCsv(serializeAssetsCsv(assets))).toEqual(assets);
  });

  it('produces an empty-body CSV (header only) for an empty selection', () => {
    expect(serializeAssetsCsv([])).toBe(`${ASSETS_CSV_HEADER}\n`);
  });
});

describe('asset workspace JSON (ADR-0031)', () => {
  it('round-trips assetTypes + assets through serialize/parse', () => {
    const types = applyAssetTypeMappings(
      parseAssetTypesCsv(ASSET_TYPES_CSV),
      parseAssetTypeMappingsCsv(MAPPINGS_CSV),
    );
    const assets = parseAssetsCsv(ASSETS_CSV);
    const json = serializeAssetWorkspaceJson(types, assets);
    expect(parseAssetWorkspaceJson(json)).toEqual({ assetTypes: types, assets });
  });

  it('rejects non-JSON text', () => {
    expect(() => parseAssetWorkspaceJson('{not json')).toThrow(/JSON/i);
  });

  it('rejects a document missing the assetTypes or assets array', () => {
    expect(() => parseAssetWorkspaceJson('{"assets": []}')).toThrow(/assetTypes/i);
    expect(() => parseAssetWorkspaceJson('{"assetTypes": []}')).toThrow(/assets/i);
  });
});
