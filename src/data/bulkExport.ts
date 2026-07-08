/**
 * Bulk zip-bundle download for a selected set of OSCAL artifacts (ADR-0027) — realizes the
 * "export bundle (zip or JSON manifest) of the whole workspace" ADR-0004 already planned but
 * never implemented; `fflate` was installed for this from the start but had no caller until now.
 * Pure zip-building logic is separated from the DOM download trigger for testability, mirroring
 * `fileIo.ts`'s `serializeArtifact`/`downloadArtifact` split.
 */
import { zipSync, strToU8 } from 'fflate';
import { serializeArtifact, defaultFilename, validateForExport } from './fileIo';
import { serializeAssetsCsv, type Asset } from '@/models/asset';
import type { StoredArtifact } from './db';

export interface BuildZipResult {
  /** `null` when nothing in the batch was exportable — caller should not trigger a download. */
  zipBytes: Uint8Array<ArrayBuffer> | null;
  /** One human-readable entry per skipped record: "<title>: <problems>". */
  skipped: string[];
}

function titleOf(record: StoredArtifact): string {
  return (record.artifact as { metadata?: { title?: string } })?.metadata?.title || record.uuid;
}

/**
 * Build a zip of every exportable record in the batch. A record that fails export validation
 * (e.g. no valid creator, ADR-0019) is skipped with a warning rather than blocking the rest —
 * matches the app's draft-friendly, non-blocking validation philosophy.
 */
export function buildArtifactsZip(records: StoredArtifact[]): BuildZipResult {
  const files: Record<string, Uint8Array> = {};
  const skipped: string[] = [];
  const usedNames = new Set<string>();

  for (const record of records) {
    const problems = validateForExport(record);
    if (problems.length > 0) {
      skipped.push(`${titleOf(record)}: ${problems.join(' ')}`);
      continue;
    }
    let filename = defaultFilename(record);
    // defaultFilename already includes a uuid8 suffix, making collisions effectively impossible —
    // guard anyway rather than silently letting one entry clobber another in the rare case it happens.
    if (usedNames.has(filename)) {
      filename = `${record.uuid}-${filename}`;
    }
    usedNames.add(filename);
    files[filename] = strToU8(serializeArtifact(record));
  }

  if (Object.keys(files).length === 0) {
    return { zipBytes: null, skipped };
  }
  return { zipBytes: zipSync(files, { level: 6 }), skipped };
}

/**
 * Trigger a browser download of the zip bundle (thin DOM wrapper). A no-op when nothing in the
 * batch was exportable. Returns the skipped-record warnings either way, so the caller can surface
 * them regardless of whether a download happened.
 */
export function downloadArtifactsAsZip(records: StoredArtifact[], zipFilename: string): string[] {
  const { zipBytes, skipped } = buildArtifactsZip(records);
  if (!zipBytes) return skipped;

  const blob = new Blob([zipBytes], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return skipped;
}

/**
 * Trigger a browser download of assets serialized back to their CSV shape (ADR-0027). Assets
 * aren't OSCAL documents (no export-validation to skip on), so a single CSV — not a zip — is the
 * natural bulk-download format, matching how they were uploaded in the first place.
 */
export function downloadAssetsAsCsv(assets: Asset[], filename: string): void {
  const blob = new Blob([serializeAssetsCsv(assets)], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
