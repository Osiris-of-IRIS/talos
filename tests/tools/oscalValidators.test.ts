/**
 * Build-time OSCAL validator generation (ADR-0040): the vendored NIST 1.2.3 schemas are the ones
 * the manifest names (sha256, $id), and the generated standalone code is CSP-safe (no eval, no
 * `new Function`, no CommonJS `require` left for the browser bundle).
 * Decision IDs: ADR-0001, ADR-0040, ADR-0007.
 * Covers TEST-SCHEMA-01.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateValidatorModule,
  patternDatatypes,
  readManifest,
  schemaDir,
  stripDocs,
} from '../../tools/oscalValidators.mjs';
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';
import { OSCAL_SCHEMA_IDS, SCHEMA_VALIDATED_TYPES } from '@/models/schemaValidator';

const manifest = readManifest();

describe('vendored NIST OSCAL schemas (schemas/oscal/<version>/MANIFEST.json)', () => {
  it('are vendored for the authoring version', () => {
    expect(manifest.oscalVersion).toBe(OSCAL_AUTHORING_VERSION);
    expect(schemaDir()).toMatch(
      new RegExp(`schemas[/\\\\]oscal[/\\\\]${OSCAL_AUTHORING_VERSION.replace(/\./g, '\\.')}$`),
    );
  });

  it('match their recorded sha256 and $id, and the $id TALOS writes as "$schema"', () => {
    for (const [type, entry] of Object.entries(manifest.schemas)) {
      const bytes = readFileSync(join(schemaDir(), entry.file));
      expect(createHash('sha256').update(bytes).digest('hex'), entry.file).toBe(entry.sha256);
      const schema = JSON.parse(bytes.toString('utf-8')) as { $id: string; required: string[] };
      expect(schema.$id).toBe(entry.id);
      expect(schema.required).toEqual([entry.rootKey]);
      expect(OSCAL_SCHEMA_IDS[type as keyof typeof OSCAL_SCHEMA_IDS]).toBe(schema.$id);
    }
  });

  it('cover every artifact type TALOS validates (catalog, profile, component-definition, SSP)', () => {
    expect(Object.keys(manifest.schemas).sort()).toEqual([...SCHEMA_VALIDATED_TYPES].sort());
  });
});

describe('stripDocs', () => {
  it('drops title/description/$comment keywords but keeps properties literally named "title"', () => {
    const schema = {
      $comment: 'x',
      title: 'Doc',
      type: 'object',
      properties: { title: { title: 'title field', description: 'd', type: 'string' } },
      definitions: { A: { description: 'a', anyOf: [{ title: 'b', type: 'string' }] } },
    };
    expect(stripDocs(schema)).toEqual({
      type: 'object',
      properties: { title: { type: 'string' } },
      definitions: { A: { anyOf: [{ type: 'string' }] } },
    });
  });
});

describe('patternDatatypes', () => {
  it('maps each datatype pattern to its datatype name', () => {
    const schema = JSON.parse(
      readFileSync(join(schemaDir(), manifest.schemas.systemSecurityPlan!.file), 'utf-8'),
    );
    const map = patternDatatypes(schema);
    expect(Object.values(map)).toEqual(
      expect.arrayContaining(['UUIDDatatype', 'TokenDatatype', 'StringDatatype']),
    );
  });
});

describe('generateValidatorModule', () => {
  it.each(Object.keys(manifest.schemas))(
    '%s: standalone ES module, CSP-safe (no eval/new Function/require)',
    (type) => {
      const code = generateValidatorModule(type);
      expect(code).toMatch(/export default validate\d+/);
      expect(code).toContain(
        `export const schemaId = ${JSON.stringify(manifest.schemas[type]!.id)}`,
      );
      expect(code).not.toMatch(/\bnew Function\b|\beval\(/);
      expect(code).not.toMatch(/\brequire\(/);
      expect(code).toContain('from "ajv-formats/dist/formats.js"');
    },
  );

  it('rejects an artifact type with no vendored schema', () => {
    expect(() => generateValidatorModule('assessmentPlan')).toThrow(/no vendored OSCAL schema/);
  });
});
