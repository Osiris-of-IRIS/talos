/**
 * OSCAL_AUTHORING_VERSION is the single source of truth for the version TALOS authors and
 * exports (ADR-0007): every blank factory and the runtime config default use it, and no other
 * OSCAL version literal may drift in under src/ or tools/. Decision IDs: ADR-0001, ADR-0007.
 * Covers TEST-VER-02 (feature_registry PLAT-004).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';
import { createBlankSsp } from '@/features/ssps/blank';
import { createBlankProfile } from '@/features/profiles/blank';
import { createBlankComponentDefinition } from '@/features/componentDefinitions/blank';
import { TALOS_CONFIG, validateConfig } from '@/config';

const REPO_ROOT = resolve(__dirname, '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('single source of the authoring OSCAL version', () => {
  it('every blank factory stamps OSCAL_AUTHORING_VERSION', () => {
    expect(createBlankSsp().metadata.oscalVersion).toBe(OSCAL_AUTHORING_VERSION);
    expect(createBlankProfile().metadata.oscalVersion).toBe(OSCAL_AUTHORING_VERSION);
    expect(createBlankComponentDefinition().metadata.oscalVersion).toBe(OSCAL_AUTHORING_VERSION);
  });

  it('the runtime config default carries the authoring version and validates', () => {
    expect(TALOS_CONFIG.oscalVersion).toBe(OSCAL_AUTHORING_VERSION);
    expect(validateConfig(TALOS_CONFIG)).toEqual([]);
    expect(validateConfig({ ...TALOS_CONFIG, oscalVersion: '1.2.2' })).toEqual([
      `oscalVersion must be "${OSCAL_AUTHORING_VERSION}", got "1.2.2"`,
    ]);
  });

  it('no hard-coded OSCAL version string literal outside oscalBase.ts (src/, tools/)', () => {
    // A quoted x.y.z literal on a line that talks about the OSCAL version (`oscalVersion: '1.2.2'`,
    // `'oscal-version': "1.2.2"`, `OSCAL_VERSION = '1.2.2'`). Artifact `version: '1.0.0'` seeds are
    // document versions, not OSCAL versions, and are not matched.
    const literal = /oscal[-_ ]?version\b.*['"`]\d+\.\d+\.\d+['"`]/i;
    const allowed = new Set(['src/models/oscalBase.ts']);
    const offenders: string[] = [];
    for (const dir of ['src', 'tools']) {
      for (const file of walk(join(REPO_ROOT, dir))) {
        if (!/\.(ts|tsx|mjs|js)$/.test(file)) continue;
        const rel = relative(REPO_ROOT, file).split('\\').join('/');
        if (allowed.has(rel)) continue;
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (literal.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
          });
      }
    }
    expect(offenders).toEqual([]);
  });
});
