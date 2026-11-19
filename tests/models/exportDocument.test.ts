/**
 * Export document shaping (ADR-0040, ADR-0007): the one function that turns a stored artifact into
 * the OSCAL JSON TALOS writes — and validates. It adds "$schema" (the NIST 1.2.3 schema $id of the
 * model), normalizes oscal-version to the authoring version, and drops empty arrays (every OSCAL
 * array is minItems 1, so an empty one is never valid; absent optional arrays are).
 * Decision IDs: ADR-0001, ADR-0040, ADR-0007, ADR-0003.
 * Covers TEST-SCHEMA-04.
 */
import { describe, it, expect } from 'vitest';
import { buildExportDocument, pruneEmptyArrays } from '@/models/exportDocument';
import { OSCAL_SCHEMA_IDS } from '@/models/schemaValidator';
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';
import { parseOscalUpload, serializeArtifact } from '@/data/fileIo';
import { createBlankSsp } from '@/features/ssps/blank';
import golden from '../data/ssp-minimal.json';

describe('OSCAL_SCHEMA_IDS', () => {
  it('names the NIST schema $id of the authoring version per validated model', () => {
    const v = OSCAL_AUTHORING_VERSION;
    expect(OSCAL_SCHEMA_IDS).toEqual({
      catalog: `http://csrc.nist.gov/ns/oscal/${v}/oscal-catalog-schema.json`,
      profile: `http://csrc.nist.gov/ns/oscal/${v}/oscal-profile-schema.json`,
      componentDefinition: `http://csrc.nist.gov/ns/oscal/${v}/oscal-component-definition-schema.json`,
      systemSecurityPlan: `http://csrc.nist.gov/ns/oscal/${v}/oscal-ssp-schema.json`,
    });
  });
});

describe('pruneEmptyArrays', () => {
  it('drops empty-array properties at any depth, keeps empty strings, objects and array elements', () => {
    const input = { a: [], b: '', c: { d: [], e: [{ f: [] }, 1], g: {} }, h: [[]] };
    expect(pruneEmptyArrays(input)).toEqual({ b: '', c: { e: [{}, 1], g: {} }, h: [[]] });
    expect(input.a).toEqual([]); // input is not mutated
  });
});

describe('buildExportDocument', () => {
  it('writes "$schema" first, then the single wrapper key', () => {
    const doc = buildExportDocument('systemSecurityPlan', createBlankSsp());
    expect(Object.keys(doc)).toEqual(['$schema', 'system-security-plan']);
    expect(doc.$schema).toBe(OSCAL_SCHEMA_IDS.systemSecurityPlan);
  });

  it('normalizes oscal-version to the authoring version without touching the stored artifact', () => {
    const ssp = createBlankSsp();
    ssp.metadata.oscalVersion = '1.1.2';
    const doc = buildExportDocument('systemSecurityPlan', ssp) as {
      'system-security-plan': { metadata: Record<string, unknown> };
    };
    expect(doc['system-security-plan'].metadata['oscal-version']).toBe(OSCAL_AUTHORING_VERSION);
    expect(ssp.metadata.oscalVersion).toBe('1.1.2');
  });

  it('never emits an empty array (users, by-components, …)', () => {
    const ssp = createBlankSsp();
    ssp.controlImplementation.implementedRequirements.push({
      uuid: crypto.randomUUID(),
      controlId: 'ac-1',
      byComponents: [],
    });
    const text = JSON.stringify(buildExportDocument('systemSecurityPlan', ssp));
    expect(text).not.toContain('[]');
  });

  it('omits "$schema" for a model without a bundled schema', () => {
    const doc = buildExportDocument('assessmentPlan', {
      uuid: 'x',
      metadata: { title: 't', version: '1', oscalVersion: '1.2.3' },
    });
    expect(Object.keys(doc)).toEqual(['assessment-plan']);
  });
});

describe('serializeArtifact (download text) uses the export document', () => {
  it('contains "$schema" and round-trips: re-importing ignores "$schema" and loses nothing else', () => {
    const { record } = parseOscalUpload(JSON.stringify(golden));
    const text = serializeArtifact(record);
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(json.$schema).toBe(OSCAL_SCHEMA_IDS.systemSecurityPlan);
    const { $schema, ...rest } = json;
    void $schema;
    expect(rest).toEqual(golden);
    expect(parseOscalUpload(text).record.artifact).toEqual(record.artifact);
  });
});
