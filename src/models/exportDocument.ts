/**
 * The OSCAL JSON document TALOS exports for a stored artifact — built in exactly one place, so
 * that what is validated (ADR-0040) is byte-for-byte what is downloaded.
 *  1. `metadata.oscal-version` is normalized to the authoring version (ADR-0007); the stored
 *     artifact keeps its imported version (draft-friendly).
 *  2. The app model is converted to the kebab-case wire form under its wrapper key (ADR-0003).
 *  3. Empty arrays are dropped: every array in the OSCAL 1.2.3 JSON schemas has `minItems: 1`, so
 *     an empty one is never valid, while an absent optional one is (e.g. `users`, `by-components`).
 *     A *required* array that is empty becomes "missing", which the compliance report names.
 *  4. `"$schema"` — the NIST schema `$id` of the model — is written first (PO decision 2026-11-18).
 * Decision IDs: ADR-0040, ADR-0007, ADR-0003.
 */
import { serializeOscalDocument } from './envelope';
import { OSCAL_AUTHORING_VERSION, type OscalArtifactType } from './oscalBase';
import { OSCAL_SCHEMA_IDS } from './schemaValidator';

/** Copy of `value` with every empty-array object property removed, at any depth. */
export function pruneEmptyArrays<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => pruneEmptyArrays(v)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // `undefined` never reaches the JSON text either; drop it so validation sees the same shape.
      if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
      out[k] = pruneEmptyArrays(v);
    }
    return out as T;
  }
  return value;
}

function normalizeExportVersion<T>(artifact: T): T {
  const a = artifact as { metadata?: { oscalVersion?: string } };
  if (a?.metadata && a.metadata.oscalVersion !== OSCAL_AUTHORING_VERSION) {
    return { ...a, metadata: { ...a.metadata, oscalVersion: OSCAL_AUTHORING_VERSION } } as T;
  }
  return artifact;
}

/** The export document (wire JSON object) for one artifact. Pure; does not mutate `artifact`. */
export function buildExportDocument(
  type: OscalArtifactType,
  artifact: unknown,
): Record<string, unknown> {
  const wire = pruneEmptyArrays(serializeOscalDocument(type, normalizeExportVersion(artifact)));
  const schemaId = OSCAL_SCHEMA_IDS[type];
  return schemaId ? { $schema: schemaId, ...wire } : wire;
}
