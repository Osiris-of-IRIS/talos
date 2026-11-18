/**
 * File I/O tests. Decision IDs: ADR-0001, ADR-0004, ADR-0007.
 * Covers TEST-FILE-01 (feature_registry PLAT-003).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseOscalUpload, serializeArtifact, defaultFilename, validateForExport, downloadArtifact } from '@/data/fileIo';
import { parseOscalDocument } from '@/models/envelope';
import { getImportVersionStats } from '@/data/importVersionPolicy';
import { logger } from '@/shared/logger';
import type { StoredArtifact } from '@/data/db';
import golden from './component-definition-minimal.json';
import offVersion from './component-definition-v1_1.json';

const goldenText = JSON.stringify(golden);

afterEach(() => {
  vi.restoreAllMocks();
});

function withCreator(record: StoredArtifact): StoredArtifact {
  const artifact = structuredClone(record.artifact) as {
    metadata: {
      roles?: { id: string; title: string }[];
      parties?: { uuid: string; type: string; name: string; emailAddresses?: string[] }[];
      responsibleParties?: { roleId: string; partyUuids: string[] }[];
    };
  };
  artifact.metadata.roles = [{ id: 'creator', title: 'Creator' }];
  artifact.metadata.parties = [
    { uuid: 'creator-1', type: 'person', name: 'Erika Mustermann', emailAddresses: ['erika@example.org'] },
  ];
  artifact.metadata.responsibleParties = [{ roleId: 'creator', partyUuids: ['creator-1'] }];
  return { ...record, artifact };
}

describe('parseOscalUpload', () => {
  it('parses a valid component-definition and marks it imported', () => {
    const { type, record } = parseOscalUpload(goldenText);
    expect(type).toBe('componentDefinition');
    expect(record.origin).toBe('imported');
    expect(record.uuid).toBe('11111111-1111-4111-8111-111111111111');
    expect(record.createdAt).toBe(record.updatedAt);
  });

  it('rejects non-JSON', () => {
    expect(() => parseOscalUpload('{not json')).toThrow(/valid JSON/);
  });

  it('rejects a document missing uuid', () => {
    const bad = JSON.stringify({ 'component-definition': { metadata: { title: 'x' } } });
    expect(() => parseOscalUpload(bad)).toThrow(/uuid/);
  });

  it('rejects a document missing metadata.title', () => {
    const bad = JSON.stringify({ 'component-definition': { uuid: 'u' } });
    expect(() => parseOscalUpload(bad)).toThrow(/metadata\.title/);
  });

  // ADR-0007 import version policy (amended 2026-11-16: 1.2.x patch versions import silently).
  it('has no warnings for the authoring version (1.2.3)', () => {
    expect(parseOscalUpload(goldenText).warnings).toEqual([]);
  });

  it('imports another 1.2.x patch version (1.2.2) with no warning, logging it at info level only', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => ({}) as never);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => ({}) as never);
    const before = getImportVersionStats().info;
    const doc = structuredClone(golden) as unknown as { 'component-definition': { metadata: Record<string, unknown> } };
    doc['component-definition'].metadata['oscal-version'] = '1.2.2';
    const { record, warnings } = parseOscalUpload(JSON.stringify(doc));
    expect(warnings).toEqual([]);
    expect(info).toHaveBeenCalledWith(
      expect.stringMatching(/1\.2\.x/),
      ['ADR-0007'],
      expect.objectContaining({ source: 'upload', version: '1.2.2', target: '1.2.3' }),
    );
    expect(warn).not.toHaveBeenCalled();
    expect(getImportVersionStats().info).toBe(before + 1);
    // stored as-is, export still normalizes
    expect((record.artifact as { metadata: { oscalVersion: string } }).metadata.oscalVersion).toBe('1.2.2');
  });

  it('imports an off-version 1.x document with a structured normalize warning, storing it as-is', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => ({}) as never);
    const before = getImportVersionStats().warning;
    const { record, warnings } = parseOscalUpload(JSON.stringify(offVersion));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.code).toBe('oscal-version-other');
    expect(warnings[0]!.params).toEqual({ version: '1.1.2', target: '1.2.3' });
    expect(warnings[0]!.message).toMatch(/1\.1\.2.*1\.2\.3/);
    expect(getImportVersionStats().warning).toBe(before + 1);
    // stored as-is: the declared version is preserved, not rewritten on import
    expect((record.artifact as { metadata: { oscalVersion: string } }).metadata.oscalVersion).toBe('1.1.2');
  });

  it('rejects a non-1.x oscal-version', () => {
    const bad = JSON.stringify({
      'component-definition': { uuid: 'u', metadata: { title: 't', 'oscal-version': '2.0.0' } },
    });
    expect(() => parseOscalUpload(bad)).toThrow(/1\.x only/);
  });
});

describe('serializeArtifact', () => {
  it('round-trips back to the original OSCAL structure', () => {
    const { record } = parseOscalUpload(goldenText);
    const out = serializeArtifact(record);
    expect(parseOscalDocument(JSON.parse(out))).toEqual(parseOscalDocument(golden));
  });

  it('normalizes oscal-version to 1.2.3 on export without mutating the stored artifact (ADR-0007)', () => {
    const { record } = parseOscalUpload(JSON.stringify(offVersion));
    const out = JSON.parse(serializeArtifact(record)) as {
      'component-definition': { metadata: { 'oscal-version': string } };
    };
    expect(out['component-definition'].metadata['oscal-version']).toBe('1.2.3');
    // the stored record keeps its imported version (draft-friendly)
    expect((record.artifact as { metadata: { oscalVersion: string } }).metadata.oscalVersion).toBe('1.1.2');
  });
});

describe('validateForExport / export gate (ADR-0019)', () => {
  it('blocks export when the artifact has no valid creator', () => {
    const { record } = parseOscalUpload(goldenText); // minimal fixture: role "provider", no creator
    const problems = validateForExport(record);
    expect(problems.length).toBeGreaterThan(0);
    expect(() => downloadArtifact(record)).toThrow(/Cannot export/i);
  });

  it('allows export when a creator with name + email is present', () => {
    const { record } = parseOscalUpload(goldenText);
    expect(validateForExport(withCreator(record))).toEqual([]);
  });
});

describe('validateForExport / required base fields (T-151)', () => {
  it('blocks export when metadata.title is empty (draft-friendly editing can clear it)', () => {
    const { record } = parseOscalUpload(goldenText);
    const withCreatorRecord = withCreator(record);
    const artifact = structuredClone(withCreatorRecord.artifact) as { metadata: { title: string } };
    artifact.metadata.title = '   ';
    const problems = validateForExport({ ...withCreatorRecord, artifact });
    expect(problems.some((p) => /title/i.test(p))).toBe(true);
    expect(() => downloadArtifact({ ...withCreatorRecord, artifact })).toThrow(/Cannot export.*title/i);
  });

  it('blocks export when metadata.version is empty', () => {
    const { record } = parseOscalUpload(goldenText);
    const withCreatorRecord = withCreator(record);
    const artifact = structuredClone(withCreatorRecord.artifact) as { metadata: { version: string } };
    artifact.metadata.version = '';
    const problems = validateForExport({ ...withCreatorRecord, artifact });
    expect(problems.some((p) => /version/i.test(p))).toBe(true);
    expect(() => downloadArtifact({ ...withCreatorRecord, artifact })).toThrow(/Cannot export.*version/i);
  });

  it('reports every violation at once, not just the first', () => {
    const { record } = parseOscalUpload(goldenText); // no creator either
    const artifact = structuredClone(record.artifact) as { metadata: { title: string; version: string } };
    artifact.metadata.title = '';
    artifact.metadata.version = '';
    const problems = validateForExport({ ...record, artifact });
    expect(problems.some((p) => /title/i.test(p))).toBe(true);
    expect(problems.some((p) => /version/i.test(p))).toBe(true);
    expect(problems.some((p) => /creator/i.test(p))).toBe(true);
  });

  it('still allows export when title/version/creator are all present (unchanged happy path)', () => {
    const { record } = parseOscalUpload(goldenText);
    expect(validateForExport(withCreator(record))).toEqual([]);
  });
});

describe('defaultFilename', () => {
  it('builds <type>-<slug>-<uuid8>.json', () => {
    const { record } = parseOscalUpload(goldenText);
    expect(defaultFilename(record)).toBe('componentDefinition-passwortrichtlinie-11111111.json');
  });
});
