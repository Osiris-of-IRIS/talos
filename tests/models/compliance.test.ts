/**
 * Compliance model (ADR-0040): Ajv errors → human-addressable compliance issues, and the
 * compliance-gate decision for workflow inputs. The error arrays below are verbatim shapes the
 * generated 1.2.3 validators emit (captured from the real validators), so the normalization is
 * tested against what the app actually sees.
 * Decision IDs: ADR-0001, ADR-0040.
 * Covers TEST-SCHEMA-03.
 */
import { describe, it, expect } from 'vitest';
import { issuesFromSchemaErrors, gateDecision, type ComplianceReport } from '@/models/compliance';
import type { SchemaError } from '@/models/schemaValidator';

const PATTERNS = {
  '^\\S(.*\\S)?$': 'StringDatatype',
  '^[^\n]+$': 'MarkupLineDatatype',
  '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[45][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$':
    'UUIDDatatype',
};

function err(
  instancePath: string,
  keyword: string,
  params: Record<string, unknown> = {},
  schemaPath = '#',
): SchemaError {
  return { instancePath, keyword, params, schemaPath };
}

describe('issuesFromSchemaErrors', () => {
  it('reports a missing required property at the property itself', () => {
    const doc = { 'system-security-plan': { 'system-characteristics': {} } };
    const issues = issuesFromSchemaErrors(
      [
        err('/system-security-plan/system-characteristics', 'required', {
          missingProperty: 'system-ids',
        }),
      ],
      doc,
      PATTERNS,
    );
    expect(issues).toEqual([
      {
        pointer: '/system-security-plan/system-characteristics/system-ids',
        path: [{ key: 'system-characteristics' }, { key: 'system-ids' }],
        code: 'required',
        params: {},
      },
    ]);
  });

  it('explains a pattern failure by datatype, and an empty string as "empty"', () => {
    const doc = { catalog: { uuid: 'x', metadata: { version: '' } } };
    const issues = issuesFromSchemaErrors(
      [
        err('/catalog/uuid', 'pattern', { pattern: Object.keys(PATTERNS)[2] }),
        err('/catalog/metadata/version', 'pattern', { pattern: '^\\S(.*\\S)?$' }),
      ],
      doc,
      PATTERNS,
    );
    expect(issues.map((i) => [i.pointer, i.code, i.params])).toEqual([
      ['/catalog/uuid', 'datatype', { datatype: 'UUIDDatatype' }],
      ['/catalog/metadata/version', 'empty', {}],
    ]);
  });

  it('collapses a scalar anyOf (enum-or-string) into one issue — "empty" for an empty value', () => {
    const doc = {
      'system-security-plan': { 'system-implementation': { components: [{ type: '' }] } },
    };
    const p = '/system-security-plan/system-implementation/components/0/type';
    const issues = issuesFromSchemaErrors(
      [
        err(p, 'pattern', { pattern: '^\\S(.*\\S)?$' }),
        err(p, 'enum', { allowedValues: ['software'] }),
        err(p, 'anyOf'),
      ],
      doc,
      PATTERNS,
    );
    expect(issues.map((i) => [i.pointer, i.code])).toEqual([[p, 'empty']]);
  });

  it('collapses a scalar anyOf with a non-empty value into "invalid-value"', () => {
    const doc = { x: { v: 'a b' } };
    const issues = issuesFromSchemaErrors(
      [err('/x/v', 'enum', { allowedValues: ['a'] }), err('/x/v', 'anyOf')],
      doc,
      PATTERNS,
    );
    expect(issues.map((i) => [i.pointer, i.code])).toEqual([['/x/v', 'invalid-value']]);
  });

  it('object anyOf with only branch discriminators → one "required-one-of" naming the alternatives', () => {
    const doc = { profile: { imports: [{ href: '#x' }] } };
    const issues = issuesFromSchemaErrors(
      [
        err('/profile/imports/0', 'required', { missingProperty: 'include-all' }),
        err('/profile/imports/0', 'required', { missingProperty: 'include-controls' }),
        err('/profile/imports/0', 'anyOf'),
      ],
      doc,
      PATTERNS,
    );
    expect(issues).toEqual([
      expect.objectContaining({
        pointer: '/profile/imports/0',
        code: 'required-one-of',
        params: { fields: 'include-all, include-controls' },
      }),
    ]);
  });

  it('object anyOf with deeper errors keeps only the deeper (real) errors, deduplicated across branches', () => {
    const doc = {
      catalog: {
        metadata: { parties: [{ 'email-addresses': ['nope'] }] },
        groups: [{ id: 'g', controls: [{ id: 'c 1', title: 'C' }] }],
      },
    };
    const email = '/catalog/metadata/parties/0/email-addresses/0';
    const issues = issuesFromSchemaErrors(
      [
        err(email, 'format', { format: 'email' }),
        err(email, 'format', { format: 'email' }),
        err('/catalog/metadata/parties/0', 'anyOf'),
        err('/catalog/groups/0', 'additionalProperties', { additionalProperty: 'controls' }),
        err('/catalog/groups/0/controls/0/id', 'pattern', {
          pattern: '^(\\p{L}|_)(\\p{L}|\\p{N}|[.\\-_])*$',
        }),
        err('/catalog/groups/0', 'anyOf'),
      ],
      doc,
      PATTERNS,
    );
    expect(issues.map((i) => [i.pointer, i.code])).toEqual([
      [email, 'format'],
      ['/catalog/groups/0/controls/0/id', 'datatype'],
    ]);
  });

  it('names unknown fields at their own pointer', () => {
    const issues = issuesFromSchemaErrors(
      [err('/catalog/controls/0', 'additionalProperties', { additionalProperty: 'unknown-field' })],
      { catalog: { controls: [{ id: 'a' }] } },
      PATTERNS,
    );
    expect(issues[0]).toMatchObject({
      pointer: '/catalog/controls/0/unknown-field',
      code: 'unknown-field',
    });
  });

  it('adds an identifying hint to array segments (control-id, id, title, name, uuid prefix)', () => {
    const doc = {
      'system-security-plan': {
        'control-implementation': {
          'implemented-requirements': [
            { uuid: 'u1', 'control-id': 'ac-1', 'by-components': [{ uuid: 'abcdef12-0000' }] },
          ],
        },
      },
    };
    const [issue] = issuesFromSchemaErrors(
      [
        err(
          '/system-security-plan/control-implementation/implemented-requirements/0/by-components/0',
          'required',
          { missingProperty: 'description' },
        ),
      ],
      doc,
      PATTERNS,
    );
    expect(issue!.path).toEqual([
      { key: 'control-implementation' },
      { key: 'implemented-requirements' },
      { index: 0, hint: 'ac-1' },
      { key: 'by-components' },
      { index: 0, hint: 'abcdef12' },
      { key: 'description' },
    ]);
  });

  it('carries type/enum/minItems/format/other parameters as strings', () => {
    const doc = { a: { b: 1, c: 'z', d: [], e: 'x', f: 3 } };
    const issues = issuesFromSchemaErrors(
      [
        err('/a/b', 'type', { type: 'array' }),
        err('/a/c', 'enum', { allowedValues: ['x', 'y'] }),
        err('/a/d', 'minItems', { limit: 1 }),
        err('/a/e', 'format', { format: 'uri' }),
        {
          instancePath: '/a/f',
          keyword: 'minimum',
          params: { limit: 5 },
          schemaPath: '#',
          message: 'must be >= 5',
        },
      ],
      doc,
      PATTERNS,
    );
    expect(issues.map((i) => [i.code, i.params])).toEqual([
      ['type', { expected: 'array' }],
      ['enum', { allowed: 'x, y' }],
      ['min-items', { limit: '1' }],
      ['format', { format: 'uri' }],
      ['other', { keyword: 'minimum', message: 'must be >= 5' }],
    ]);
  });
});

describe('gateDecision (compliance gate for workflow inputs)', () => {
  const compliant: ComplianceReport = { status: 'compliant', issues: [], oscalVersion: '1.2.3' };
  const nonCompliant: ComplianceReport = {
    status: 'non-compliant',
    oscalVersion: '1.2.3',
    issues: [
      { pointer: '/profile/imports', path: [{ key: 'imports' }], code: 'required', params: {} },
    ],
  };
  const unchecked: ComplianceReport = { status: 'unchecked', issues: [], oscalVersion: '1.2.3' };

  it('only a compliant report is usable as a workflow input', () => {
    expect(gateDecision(compliant)).toEqual({ usable: true });
    expect(gateDecision(nonCompliant)).toEqual({
      usable: false,
      reason: 'non-compliant',
      report: nonCompliant,
    });
  });

  it('fails closed: unchecked (no bundled schema) and pending (not yet validated) are not usable', () => {
    expect(gateDecision(unchecked)).toEqual({
      usable: false,
      reason: 'unchecked',
      report: unchecked,
    });
    expect(gateDecision(undefined)).toEqual({ usable: false, reason: 'pending' });
  });

  it('a "compliant" status with leftover issues is never usable (defensive)', () => {
    expect(gateDecision({ ...nonCompliant, status: 'compliant' }).usable).toBe(false);
  });
});
