/**
 * Golden round-trip + codec tests for the OSCAL envelope. Decision IDs: ADR-0001, ADR-0003.
 * Covers TEST-MODEL-01 (feature_registry PLAT-004).
 */
import { describe, it, expect } from 'vitest';
import {
  parseOscalDocument,
  serializeOscalDocument,
  kebabToCamel,
  camelToKebab,
} from '@/models/envelope';
import type { ComponentDefinition } from '@/models/componentDefinition';
import golden from '../data/component-definition-minimal.json';
import cdReferencing from '../data/component-definition-referencing.json';
import catalogMinimal from '../data/catalog-minimal.json';
import sspMinimal from '../data/ssp-minimal.json';

describe('case conversion', () => {
  it('kebabToCamel converts multi-segment keys', () => {
    expect(kebabToCamel('last-modified')).toBe('lastModified');
    expect(kebabToCamel('responsible-parties')).toBe('responsibleParties');
    expect(kebabToCamel('oscal-version')).toBe('oscalVersion');
    expect(kebabToCamel('title')).toBe('title');
  });

  it('camelToKebab is the inverse for normal keys', () => {
    expect(camelToKebab('lastModified')).toBe('last-modified');
    expect(camelToKebab('responsibleParties')).toBe('responsible-parties');
    expect(camelToKebab('oscalVersion')).toBe('oscal-version');
  });

  it('preserves digit-containing words in both directions (e.g. base64)', () => {
    expect(kebabToCamel('base64')).toBe('base64');
    expect(camelToKebab('base64')).toBe('base64');
  });
});

describe('parseOscalDocument', () => {
  it('detects the artifact type from the wrapper key', () => {
    const { type } = parseOscalDocument(golden);
    expect(type).toBe('componentDefinition');
  });

  it('converts the body to the camelCase app model', () => {
    const { artifact } = parseOscalDocument<ComponentDefinition>(golden);
    expect(artifact.metadata.lastModified).toBe('2026-07-02T10:00:00Z');
    expect(artifact.metadata.oscalVersion).toBe('1.2.2');
    expect(artifact.metadata.responsibleParties?.[0]?.roleId).toBe('provider');
    expect(artifact.components?.[0]?.controlImplementations?.[0]?.implementedRequirements[0]?.controlId).toBe(
      'IA-5',
    );
  });

  it('rejects non-OSCAL and multi-key inputs', () => {
    expect(() => parseOscalDocument(null)).toThrow();
    expect(() => parseOscalDocument({ a: 1, b: 2 })).toThrow(/exactly one/);
    expect(() => parseOscalDocument({ 'unknown-model': {} })).toThrow(/Unsupported/);
  });
});

describe('golden round-trip (import -> model -> export)', () => {
  it('serializes back to a byte-equal-by-structure OSCAL document', () => {
    const { type, artifact } = parseOscalDocument<ComponentDefinition>(golden);
    const roundTripped = serializeOscalDocument(type, artifact);
    expect(roundTripped).toEqual(golden);
  });

  // Coverage hardening (T-021): the codec is generic, so prove losslessness across every
  // implemented artifact shape — different wrapper keys (system-security-plan), nested
  // grouped controls (catalog), and cross-artifact references (referencing CD). A wrapper
  // or case-conversion regression specific to one shape would otherwise slip through.
  it.each([
    ['component-definition (referencing)', cdReferencing],
    ['catalog (grouped controls)', catalogMinimal],
    ['system-security-plan', sspMinimal],
  ])('round-trips %s losslessly', (_label, doc) => {
    const { type, artifact } = parseOscalDocument(doc);
    expect(serializeOscalDocument(type, artifact)).toEqual(doc);
  });
});
