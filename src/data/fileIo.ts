/**
 * OSCAL file I/O — parse uploaded documents and serialize for download. Pure functions are
 * separated from the DOM download trigger for testability. Decision IDs: ADR-0004, ADR-0003.
 */
import { parseOscalDocument, serializeOscalDocument } from '@/models/envelope';
import {
  checkImportOscalVersion,
  OSCAL_AUTHORING_VERSION,
  type Metadata,
  type OscalArtifactType,
} from '@/models/oscalBase';
import { validateCreator } from '@/models/creator';
import type { Origin, StoredArtifact } from './db';

export interface ParsedUpload<T = unknown> {
  type: OscalArtifactType;
  record: StoredArtifact<T>;
  /** Non-blocking import warnings (e.g. off-version OSCAL, ADR-0007). */
  warnings: string[];
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
  // ADR-0007: accept any 1.x (warn if off the authoring version); throw on non-1.x. The
  // document is stored as-is, preserving its declared oscal-version.
  const warnings: string[] = [];
  const versionWarning = checkImportOscalVersion(a.metadata.oscalVersion);
  if (versionWarning) warnings.push(versionWarning);
  const ts = new Date().toISOString();
  return {
    type,
    record: { uuid: a.uuid, type, origin, createdAt: ts, updatedAt: ts, artifact },
    warnings,
  };
}

/**
 * On export, normalize `metadata.oscal-version` to the authoring version (ADR-0007). Returns a
 * shallow copy so the stored artifact keeps its imported version (draft-friendly); a no-op when
 * already at the authoring version.
 */
function normalizeExportVersion<T>(artifact: T): T {
  const a = artifact as { metadata?: { oscalVersion?: string } };
  if (a?.metadata && a.metadata.oscalVersion !== OSCAL_AUTHORING_VERSION) {
    return { ...a, metadata: { ...a.metadata, oscalVersion: OSCAL_AUTHORING_VERSION } } as T;
  }
  return artifact;
}

/** Serialize a stored artifact back to spec-shaped OSCAL JSON text (pretty-printed). */
export function serializeArtifact(record: StoredArtifact): string {
  const artifact = normalizeExportVersion(record.artifact);
  return JSON.stringify(serializeOscalDocument(record.type, artifact), null, 2);
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
 * Validity problems that must be resolved before an artifact can be exported (ADR-0019, and the
 * T-151 export-validity path). Draft-friendly: this gates *export*, never editing. Returns an
 * empty list when the artifact is exportable; collects every violation, not just the first, so
 * the caller can show them all at once.
 *
 * Scope is the shared base envelope only (uuid/metadata are always present by construction —
 * `blank.ts` seeds them and `parseOscalUpload` rejects a missing uuid/title — but `title` and
 * `version` are free-text fields a user can clear while editing, draft-friendly). `oscal-version`
 * is deliberately not checked here: `serializeArtifact`'s `normalizeExportVersion` unconditionally
 * rewrites it to the authoring version on every export, so no exported document can ever carry an
 * invalid one regardless of what's stored. Per-type field validation (e.g. SSP system
 * characteristics) and full NIST JSON-Schema validation are deferred to T-030.
 */
export function validateForExport(record: StoredArtifact): string[] {
  const metadata = (record.artifact as { metadata?: Metadata }).metadata;
  if (!metadata) return ['Artifact has no metadata.'];

  const problems: string[] = [];
  if (typeof metadata.title !== 'string' || metadata.title.trim().length === 0) {
    problems.push('metadata.title is required — give the artifact a title before exporting.');
  }
  if (typeof metadata.version !== 'string' || metadata.version.trim().length === 0) {
    problems.push('metadata.version is required — give the artifact a version before exporting.');
  }
  problems.push(...validateCreator(metadata));
  return problems;
}

/**
 * Trigger a browser download of the artifact as OSCAL JSON (thin DOM wrapper). Throws when the
 * artifact is not exportable (e.g. missing a valid creator, ADR-0019) so the caller can surface it.
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
