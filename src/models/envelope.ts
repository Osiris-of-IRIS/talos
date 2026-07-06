/**
 * OSCAL envelope codec: converts between the kebab-case JSON wire form and the
 * camelCase app model, and maps the single-key document wrapper to/from an artifact type.
 * This is the one place case-conversion happens (ADR-0003).
 */
import { OSCAL_WRAPPER_KEYS, type OscalArtifactType } from './oscalBase';

export function kebabToCamel(key: string): string {
  return key.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function camelToKebab(key: string): string {
  // OSCAL JSON keys are lowercase kebab; word boundaries in the camelCase model are
  // uppercase letters only. Digits stay within their word (e.g. "base64" — not "base-6-4").
  return key.replace(/([A-Z])/g, (c) => '-' + c.toLowerCase());
}

type Json = unknown;

/** Recursively transform object keys with `fn`; values (including strings) are left intact. */
function deepTransformKeys(value: Json, fn: (key: string) => string): Json {
  if (Array.isArray(value)) {
    return value.map((v) => deepTransformKeys(v, fn));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(value as Record<string, Json>)) {
      out[fn(k)] = deepTransformKeys(v, fn);
    }
    return out;
  }
  return value;
}

const JSON_KEY_TO_TYPE: Record<string, OscalArtifactType> = Object.fromEntries(
  Object.entries(OSCAL_WRAPPER_KEYS).map(([type, jsonKey]) => [jsonKey, type as OscalArtifactType]),
) as Record<string, OscalArtifactType>;

export interface ParsedOscalDocument<T = Record<string, unknown>> {
  type: OscalArtifactType;
  artifact: T;
}

/**
 * Parse an OSCAL document JSON (single wrapper key) into `{ type, artifact }` with the
 * body converted to the camelCase app model. Throws on an unrecognized wrapper.
 */
export function parseOscalDocument<T = Record<string, unknown>>(
  json: unknown,
): ParsedOscalDocument<T> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Not an OSCAL document: expected a JSON object with a single wrapper key.');
  }
  const keys = Object.keys(json as Record<string, unknown>);
  if (keys.length !== 1) {
    throw new Error(
      `Not an OSCAL document: expected exactly one top-level wrapper key, found ${keys.length} (${keys.join(', ')}).`,
    );
  }
  const wrapperKey = keys[0]!;
  const type = JSON_KEY_TO_TYPE[wrapperKey];
  if (!type) {
    throw new Error(`Unsupported OSCAL document type: "${wrapperKey}".`);
  }
  const body = (json as Record<string, unknown>)[wrapperKey];
  const artifact = deepTransformKeys(body, kebabToCamel) as T;
  return { type, artifact };
}

/**
 * Serialize an app-model artifact back to OSCAL document JSON: kebab-case body under its
 * single wrapper key.
 */
export function serializeOscalDocument(
  type: OscalArtifactType,
  artifact: unknown,
): Record<string, unknown> {
  const wrapperKey = OSCAL_WRAPPER_KEYS[type];
  return { [wrapperKey]: deepTransformKeys(artifact, camelToKebab) };
}
