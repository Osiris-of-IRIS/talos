/**
 * Build-time OSCAL JSON-Schema validator generation (ADR-0040).
 *
 * The page's Content-Security-Policy (`script-src 'self'`, index.html) forbids `eval`/`new
 * Function`, so Ajv cannot compile schemas in the browser. Instead, every vendored NIST OSCAL
 * schema (`schemas/oscal/<version>/`, listed in its MANIFEST.json) is compiled here, at build/test
 * time, into a standalone ES module (Ajv "standalone code"), served to the app as the virtual
 * module `virtual:oscal-validator/<artifactType>` by `oscalValidatorsPlugin()` (wired into
 * vite.config.ts and vitest.config.ts). The app imports each one lazily (one chunk per model).
 *
 * Generated module exports:
 *   default            — the Ajv validate function (`validate(doc) => boolean`, `.errors`)
 *   schemaId           — the schema's `$id` (written as `"$schema"` into exports)
 *   patternDatatypes   — `{ <regex source>: <OSCAL datatype name> }`, so a `pattern` error can be
 *                        explained by datatype ("UUIDDatatype") instead of a raw regex.
 *
 * Decision IDs: ADR-0040, ADR-0007, ADR-0002.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;
const standaloneCode = require('ajv/dist/standalone').default;
const { _ } = require('ajv/dist/compile/codegen');

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const VIRTUAL_PREFIX = 'virtual:oscal-validator/';
const FORMATS_REQUIRE = 'require("ajv-formats/dist/formats").fullFormats';
const FORMATS_IMPORT =
  'import { fullFormats as __talosFullFormats } from "ajv-formats/dist/formats.js";';

/** The vendored-schema directory for the OSCAL version TALOS authors (read from oscalBase.ts). */
export function schemaDir(root = REPO_ROOT) {
  const base = readFileSync(join(root, 'src/models/oscalBase.ts'), 'utf-8');
  const m = base.match(/OSCAL_AUTHORING_VERSION\s*=\s*'([^']+)'/);
  if (!m)
    throw new Error(
      'tools/oscalValidators.mjs: OSCAL_AUTHORING_VERSION not found in src/models/oscalBase.ts',
    );
  return join(root, 'schemas/oscal', m[1]);
}

export function readManifest(root = REPO_ROOT) {
  return JSON.parse(readFileSync(join(schemaDir(root), 'MANIFEST.json'), 'utf-8'));
}

const SCHEMA_MAPS = new Set(['properties', 'definitions', 'patternProperties']);
const SCHEMA_SINGLE = new Set([
  'items',
  'additionalProperties',
  'not',
  'if',
  'then',
  'else',
  'contains',
]);
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf']);

/**
 * Drop documentation-only keywords (`title`, `description`, `$comment`) from every schema node —
 * never from a `properties`/`definitions` map key (OSCAL has a property literally named "title").
 * Ajv embeds the schema in the generated code; the prose is ~half its size and never used.
 */
export function stripDocs(node) {
  if (Array.isArray(node)) return node.map(stripDocs);
  if (node === null || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'title' || k === 'description' || k === '$comment') continue;
    if (SCHEMA_MAPS.has(k) && v && typeof v === 'object') {
      out[k] = Object.fromEntries(Object.entries(v).map(([name, s]) => [name, stripDocs(s)]));
    } else if (SCHEMA_SINGLE.has(k) || SCHEMA_LISTS.has(k)) {
      out[k] = stripDocs(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** `{ regexSource: datatypeName }` for every `definitions/*Datatype` that carries a pattern. */
export function patternDatatypes(schema) {
  const out = {};
  for (const [name, def] of Object.entries(schema.definitions ?? {})) {
    if (def && typeof def.pattern === 'string') out[def.pattern] = name;
  }
  return out;
}

const cache = new Map();

/** Generate the standalone validator ES module source for one artifact type (memoized). */
export function generateValidatorModule(artifactType, root = REPO_ROOT) {
  const key = `${root}|${artifactType}`;
  if (cache.has(key)) return cache.get(key);
  const manifest = readManifest(root);
  const entry = manifest.schemas[artifactType];
  if (!entry) {
    throw new Error(
      `tools/oscalValidators.mjs: no vendored OSCAL schema for "${artifactType}" (have: ${Object.keys(manifest.schemas).join(', ')})`,
    );
  }
  const raw = JSON.parse(readFileSync(join(schemaDir(root), entry.file), 'utf-8'));
  const ajv = new Ajv({
    // NIST schemas are draft-07 and use keywords/annotations Ajv's strict mode rejects.
    strict: false,
    // Name every non-compliant field, not just the first (PO decision, backlog #3).
    allErrors: true,
    // OSCAL token/patterns use \p{L} / \p{N} — needs the "u" flag.
    unicodeRegExp: true,
    code: { source: true, esm: true, formats: _`require("ajv-formats/dist/formats").fullFormats` },
  });
  addFormats(ajv);
  const validate = ajv.compile(stripDocs(raw));
  // Standalone ESM output still references the formats module CommonJS-style; hoist it into one
  // ES import. Any other runtime `require` would not survive the browser bundle — fail loudly.
  let code = standaloneCode(ajv, validate).split(FORMATS_REQUIRE).join('__talosFullFormats');
  const leftover = code.match(/require\("[^"]*"\)/g);
  if (leftover) {
    throw new Error(
      `tools/oscalValidators.mjs: generated validator for "${artifactType}" needs unsupported runtime modules: ${[...new Set(leftover)].join(', ')}`,
    );
  }
  code = code.replace(/^"use strict";/, '"use strict";' + FORMATS_IMPORT);
  if (!code.includes(FORMATS_IMPORT)) code = FORMATS_IMPORT + code;
  code +=
    `\nexport const schemaId = ${JSON.stringify(raw.$id)};` +
    `\nexport const patternDatatypes = ${JSON.stringify(patternDatatypes(raw))};\n`;
  cache.set(key, code);
  return code;
}

/** Vite/Vitest plugin serving `virtual:oscal-validator/<artifactType>` (ADR-0040). */
export function oscalValidatorsPlugin(root = REPO_ROOT) {
  const resolvedPrefix = '\0' + VIRTUAL_PREFIX;
  return {
    name: 'talos-oscal-validators',
    resolveId(id) {
      return id.startsWith(VIRTUAL_PREFIX) ? '\0' + id : undefined;
    },
    load(id) {
      if (!id.startsWith(resolvedPrefix)) return undefined;
      const artifactType = id.slice(resolvedPrefix.length);
      const manifest = readManifest(root);
      const entry = manifest.schemas[artifactType];
      if (entry) this.addWatchFile(join(schemaDir(root), entry.file));
      return generateValidatorModule(artifactType, root);
    },
  };
}
