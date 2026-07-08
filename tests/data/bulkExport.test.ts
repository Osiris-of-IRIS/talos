/**
 * Bulk zip-bundle export for a selected set of OSCAL artifacts (ADR-0027) — realizes the
 * "export bundle" ADR-0004 planned but never implemented, via fflate.
 * Covers TEST-BULK-02.
 */
import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { buildArtifactsZip } from '@/data/bulkExport';
import { parseOscalUpload } from '@/data/fileIo';
import type { StoredArtifact } from '@/data/db';
import golden from './component-definition-minimal.json';
import compDefReferencing from './component-definition-referencing.json';

const goldenText = JSON.stringify(golden);

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

describe('buildArtifactsZip', () => {
  it('zips every exportable record, keyed by its default filename', () => {
    const a = withCreator(parseOscalUpload(goldenText).record);
    const b = withCreator(parseOscalUpload(JSON.stringify(compDefReferencing)).record);

    const { zipBytes, skipped } = buildArtifactsZip([a, b]);
    expect(skipped).toEqual([]);
    expect(zipBytes).not.toBeNull();

    const unzipped = unzipSync(zipBytes!);
    const names = Object.keys(unzipped);
    expect(names).toHaveLength(2);
    // each entry parses back as valid OSCAL JSON for its record
    const parsedA = JSON.parse(strFromU8(unzipped[names.find((n) => n.includes(a.uuid.slice(0, 8)))!]!));
    expect(parsedA['component-definition'].uuid).toBe(a.uuid);
  });

  it('skips a record that fails export validation, with a named warning, and zips the rest', () => {
    const noCreator = parseOscalUpload(goldenText).record; // minimal fixture has no valid creator
    const valid = withCreator(parseOscalUpload(JSON.stringify(compDefReferencing)).record);

    const { zipBytes, skipped } = buildArtifactsZip([noCreator, valid]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatch(/Passwortrichtlinie/); // the minimal fixture's title
    expect(zipBytes).not.toBeNull();
    expect(Object.keys(unzipSync(zipBytes!))).toHaveLength(1);
  });

  it('returns a null zip (nothing to download) when every record is skipped', () => {
    const noCreator = parseOscalUpload(goldenText).record;
    const { zipBytes, skipped } = buildArtifactsZip([noCreator]);
    expect(zipBytes).toBeNull();
    expect(skipped).toHaveLength(1);
  });

  it('returns a null zip for an empty batch', () => {
    expect(buildArtifactsZip([])).toEqual({ zipBytes: null, skipped: [] });
  });
});
