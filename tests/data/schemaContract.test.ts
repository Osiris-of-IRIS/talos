/**
 * Schema contract: the golden OSCAL fixtures against the vendored NIST OSCAL 1.2.3 schemas, through
 * the same build-time generated validators the app uses (ADR-0040).
 *  - every registered valid fixture validates as-is *and* through TALOS' import → export pipeline;
 *  - every deliberately invalid fixture (tests/data/schema/invalid/*.json) yields exactly the
 *    compliance issues in its `.expected.json` golden report;
 *  - a large catalog (GS++ order of magnitude) validates within budget.
 * Decision IDs: ADR-0001, ADR-0040, ADR-0007, ADR-0018.
 * Covers TEST-SCHEMA-02.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseOscalUpload } from '@/data/fileIo';
import { parseOscalDocument } from '@/models/envelope';
import { loadSchemaValidator } from '@/models/schemaValidator';
import { checkRecordCompliance, _resetComplianceForTests } from '@/data/complianceCheck';
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';

const DATA = resolve(__dirname);
const INVALID_DIR = join(DATA, 'schema', 'invalid');

/** Every full OSCAL document fixture registered as golden data, all expected schema-valid. */
const VALID_FIXTURES = [
  'catalog-minimal.json',
  'catalog-target-object-categories.json',
  'component-definition-minimal.json',
  'component-definition-referencing.json',
  'component-definition-with-creator.json',
  'component-definition-with-import.json',
  'component-definition-v1_1.json',
  'profile-minimal.json',
  'ssp-minimal.json',
];

function read(path: string): string {
  return readFileSync(path, 'utf-8');
}

beforeEach(() => {
  _resetComplianceForTests();
});

describe('valid golden fixtures', () => {
  it.each(VALID_FIXTURES)('%s validates against the 1.2.3 schema as-is', async (name) => {
    const json = JSON.parse(read(join(DATA, name))) as Record<string, unknown>;
    const { type } = parseOscalDocument(json);
    const loaded = await loadSchemaValidator(type);
    expect(loaded).toBeDefined();
    // The 1.1.2 fixture is structurally 1.2.3-valid; only its declared version differs.
    const ok = loaded!.validate(json);
    expect(loaded!.validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
  });

  it.each(VALID_FIXTURES)('%s is compliant after TALOS import (export pipeline)', async (name) => {
    const { record } = parseOscalUpload(read(join(DATA, name)));
    const report = await checkRecordCompliance(record);
    expect(report.issues).toEqual([]);
    expect(report.status).toBe('compliant');
    expect(report.oscalVersion).toBe(OSCAL_AUTHORING_VERSION);
  });
});

describe('deliberately invalid golden fixtures (tests/data/schema/invalid)', () => {
  const names = readdirSync(INVALID_DIR).filter(
    (f) => f.endsWith('.json') && !f.endsWith('.expected.json'),
  );

  it('there is at least one per validated model', () => {
    const roots = names.map(
      (n) => Object.keys(JSON.parse(read(join(INVALID_DIR, n))) as object)[0],
    );
    expect(new Set(roots)).toEqual(
      new Set(['catalog', 'profile', 'component-definition', 'system-security-plan']),
    );
  });

  it.each(names)('%s yields exactly its golden compliance report', async (name) => {
    const expected = JSON.parse(
      read(join(INVALID_DIR, name.replace(/\.json$/, '.expected.json'))),
    ) as {
      status: string;
      issues: { pointer: string; code: string }[];
    };
    const { record } = parseOscalUpload(read(join(INVALID_DIR, name)));
    const report = await checkRecordCompliance(record);
    expect(report.status).toBe(expected.status);
    const key = (i: { pointer: string; code: string }) => `${i.pointer} ${i.code}`;
    expect(report.issues.map(key).sort()).toEqual(expected.issues.map(key).sort());
  });
});

describe('performance (docs/performance.md)', () => {
  it('validates a 1000-control catalog within budget', async () => {
    const controls = Array.from({ length: 1000 }, (_, i) => ({
      id: `ctl.${i}`,
      title: `Control ${i}`,
      props: [{ name: 'sec_level', value: 'normal-SdT' }],
      parts: [
        { id: `ctl.${i}_stm`, name: 'statement', prose: 'Die Institution SOLLTE '.repeat(20) },
      ],
    }));
    const text = JSON.stringify({
      catalog: {
        uuid: '6d6d6d6d-0000-4000-8000-000000000001',
        metadata: {
          title: 'Big',
          'last-modified': '2026-11-19T10:00:00Z',
          version: '1',
          'oscal-version': '1.1.3',
        },
        groups: [{ id: 'g1', title: 'Group', controls }],
      },
    });
    const { record } = parseOscalUpload(text);
    await loadSchemaValidator('catalog'); // chunk load is not part of the budget
    const t0 = performance.now();
    const report = await checkRecordCompliance(record);
    const ms = performance.now() - t0;
    expect(report.status).toBe('compliant');
    expect(ms).toBeLessThan(1500);
  });
});
