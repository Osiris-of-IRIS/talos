/**
 * Localized compliance wording (ADR-0040, ADR-0012): every non-compliant field is named by a
 * human-readable path (OSCAL field labels from the locale catalogs, array items numbered from 1
 * with an identifying hint) and a localized reason — never Ajv's English message.
 * Decision IDs: ADR-0001, ADR-0040, ADR-0012, ADR-0019.
 * Covers TEST-SCHEMA-05.
 */
import { describe, it, expect } from 'vitest';
import en from '@/locales/en.json';
import de from '@/locales/de.json';
import {
  formatIssuePath,
  formatIssueReason,
  formatCreatorProblem,
} from '@/shared/complianceMessages';
import { creatorProblems } from '@/models/creator';
import type { ComplianceIssue } from '@/models/compliance';
import type { TranslateParams } from '@/shared/i18n';

function tFor(catalog: Record<string, string>) {
  return (key: string, params?: TranslateParams) =>
    (catalog[key] ?? key).replace(/\{(\w+)\}/g, (m, k: string) =>
      params && k in params ? String(params[k]) : m,
    );
}
const tEn = tFor(en as Record<string, string>);
const tDe = tFor(de as Record<string, string>);

const systemIds: ComplianceIssue = {
  pointer: '/system-security-plan/system-characteristics/system-ids',
  path: [{ key: 'system-characteristics' }, { key: 'system-ids' }],
  code: 'required',
  params: {},
};

const byComponentDescription: ComplianceIssue = {
  pointer:
    '/system-security-plan/control-implementation/implemented-requirements/2/by-components/0/description',
  path: [
    { key: 'control-implementation' },
    { key: 'implemented-requirements' },
    { index: 2, hint: 'ac-1' },
    { key: 'by-components' },
    { index: 0 },
    { key: 'description' },
  ],
  code: 'required',
  params: {},
};

describe('formatIssuePath', () => {
  it('uses localized OSCAL field labels joined by ›', () => {
    expect(formatIssuePath(tEn, systemIds)).toBe('System characteristics › System IDs');
    expect(formatIssuePath(tDe, systemIds)).toBe('Systemmerkmale › System-IDs');
  });

  it('numbers array items from 1 and shows the identifying hint', () => {
    expect(formatIssuePath(tEn, byComponentDescription)).toBe(
      'Control implementation › Implemented requirements #3 (ac-1) › By-components #1 › Description',
    );
    expect(formatIssuePath(tDe, byComponentDescription)).toBe(
      'Kontrollumsetzung › Umgesetzte Anforderungen #3 (ac-1) › Komponentenbeiträge #1 › Beschreibung',
    );
  });

  it('falls back to the OSCAL JSON key for fields without a label, and names the document root', () => {
    const issue: ComplianceIssue = {
      pointer: '/catalog/some-exotic-key',
      path: [{ key: 'some-exotic-key' }],
      code: 'required',
      params: {},
    };
    expect(formatIssuePath(tEn, issue)).toBe('some-exotic-key');
    expect(formatIssuePath(tEn, { ...issue, path: [] })).toBe('Document');
    expect(formatIssuePath(tDe, { ...issue, path: [] })).toBe('Dokument');
  });
});

describe('formatIssueReason', () => {
  it.each([
    [{ code: 'required', params: {} }, 'Required field is missing.', 'Pflichtfeld fehlt.'],
    [{ code: 'empty', params: {} }, 'Must not be empty.', 'Darf nicht leer sein.'],
    [
      { code: 'datatype', params: { datatype: 'UUIDDatatype' } },
      'Must be a valid UUID (RFC 4122, version 4 or 5).',
      'Muss eine gültige UUID sein (RFC 4122, Version 4 oder 5).',
    ],
    [
      { code: 'datatype', params: { datatype: 'NoSuchDatatype' } },
      'Does not match the OSCAL data type NoSuchDatatype.',
      'Entspricht nicht dem OSCAL-Datentyp NoSuchDatatype.',
    ],
    [
      { code: 'format', params: { format: 'email' } },
      'Must be a valid email address.',
      'Muss eine gültige E-Mail-Adresse sein.',
    ],
    [
      { code: 'type', params: { expected: 'array' } },
      'Has the wrong type (expected: array).',
      'Hat den falschen Typ (erwartet: array).',
    ],
    [
      { code: 'enum', params: { allowed: 'a, b' } },
      'Value not allowed. Allowed: a, b.',
      'Wert nicht erlaubt. Erlaubt: a, b.',
    ],
    [
      { code: 'unknown-field', params: {} },
      'Field is not part of the OSCAL model.',
      'Feld gehört nicht zum OSCAL-Modell.',
    ],
    [
      { code: 'required-one-of', params: { fields: 'include-all, include-controls' } },
      'One of these fields is required: include-all, include-controls.',
      'Eines dieser Felder ist erforderlich: include-all, include-controls.',
    ],
  ] as const)('%o', (partial, english, german) => {
    const issue = { ...systemIds, ...partial } as ComplianceIssue;
    expect(formatIssueReason(tEn, issue)).toBe(english);
    expect(formatIssueReason(tDe, issue)).toBe(german);
  });
});

describe('formatCreatorProblem (ADR-0019 export blocker, localized)', () => {
  it('renders the structured creator problems in both languages', () => {
    const [missing] = creatorProblems({ title: 't', version: '1', oscalVersion: '1.2.3' });
    expect(formatCreatorProblem(tEn, missing!)).toBe(
      "No creator assigned. Assign a responsible party to the 'creator' role.",
    );
    expect(formatCreatorProblem(tDe, missing!)).toMatch(/Ersteller/);
  });
});
