/**
 * OSCAL file I/O — parse uploaded documents and serialize for download. Pure functions are
 * separated from the DOM download trigger for testability. Decision IDs: ADR-0004, ADR-0003.
 */
import { parseOscalDocument } from '@/models/envelope';
import { type ImportWarning, type OscalArtifactType } from '@/models/oscalBase';
import { buildExportDocument } from '@/models/exportDocument';
import { creatorProblemMessage } from '@/models/creator';
import { exportBlockers } from './complianceCheck';
import { applyImportVersionPolicy } from './importVersionPolicy';
import type { Origin, StoredArtifact } from './db';

export interface ParsedUpload<T = unknown> {
  type: OscalArtifactType;
  record: StoredArtifact<T>;
  /** Non-blocking import warnings (e.g. off-version OSCAL, ADR-0007); localized by the UI. */
  warnings: ImportWarning[];
}

/** Parse uploaded OSCAL JSON text into a stored-artifact record (origin: imported). */
export function parseOscalUpload<T = unknown>(text: string, origin: Origin = 'imported'): ParsedUpload<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  const { type, artifact } = parseOscalDocument<T>(json);
  const a = artifact as { uuid?: unknown; metadata?: { title?: unknown; oscalVersion?: unknown } };
  if (typeof a.uuid !== 'string' || a.uuid.length === 0) {
    throw new Error('OSCAL document is missing a top-level uuid.');
  }
  if (!a.metadata || typeof a.metadata.title !== 'string') {
    throw new Error('OSCAL document is missing metadata.title.');
  }
  // ADR-0007: accept any 1.x (silent for 1.2.x patches, warn for other versions); throw on
  // non-1.x. The document is stored as-is, preserving its declared oscal-version.
  const warnings = applyImportVersionPolicy(a.metadata.oscalVersion, 'upload', { title: a.metadata.title });
  const ts = new Date().toISOString();
  return {
    type,
    record: { uuid: a.uuid, type, origin, createdAt: ts, updatedAt: ts, artifact },
    warnings,
  };
}

/**
 * Serialize a stored artifact to the OSCAL JSON text TALOS downloads (pretty-printed): exactly the
 * export document the compliance check validates (`buildExportDocument`: oscal-version normalized
 * to the authoring version, empty arrays dropped, `"$schema"` first — ADR-0040, ADR-0007).
 */
export function serializeArtifact(record: StoredArtifact): string {
  return JSON.stringify(buildExportDocument(record.type, record.artifact), null, 2);
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'artifact'
  );
}

/** Default download filename: <type>-<title-slug>-<uuid8>.json */
export function defaultFilename(record: StoredArtifact): string {
  const title = (record.artifact as { metadata?: { title?: string } })?.metadata?.title ?? 'artifact';
  return `${record.type}-${slugify(title)}-${record.uuid.slice(0, 8)}.json`;
}

/**
 * Problems that *block* any export, even as a draft (ADR-0019: mandatory creator with name +
 * email), as English text for logs and the bulk-zip skip list. Draft-friendly: this gates export,
 * never editing. OSCAL schema compliance is *not* checked here: a non-compliant artifact may still
 * be downloaded as a draft after the user saw every non-compliant field (ADR-0040; the async check
 * and the draft dialog live in src/data/complianceCheck.ts and src/features/shared/useExportDownload).
 * Title, version and the other required OSCAL fields are therefore schema issues, not blockers.
 */
export function validateForExport(record: StoredArtifact): string[] {
  return exportBlockers(record).map(creatorProblemMessage);
}

/**
 * Trigger a browser download of the artifact as OSCAL JSON (thin DOM wrapper). Throws when an
 * export blocker applies (missing a valid creator, ADR-0019) so the caller can surface it. Callers
 * decide about drafts first (ADR-0040, `useExportDownload`).
 */
export function downloadArtifact(record: StoredArtifact, filename?: string): void {
  const problems = validateForExport(record);
  if (problems.length > 0) {
    throw new Error(`Cannot export: ${problems.join(' ')}`);
  }
  const blob = new Blob([serializeArtifact(record)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? defaultFilename(record);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
