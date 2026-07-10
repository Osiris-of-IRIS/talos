/**
 * Control `tags` prop parsing (ADR-0032 §4): verified against the live BSI catalog shape — a
 * single comma-separated prop, not one prop per tag. Covers TEST-PROF-05.
 */
import { describe, it, expect } from 'vitest';
import { getControlTags, controlHasTag } from '@/models/controlTags';
import type { Control } from '@/models/control';

function control(props: { name: string; value: string }[]): Control {
  return { id: 'C1', title: 'Test', props };
}

describe('getControlTags', () => {
  it('splits a comma-separated tags prop, trimmed', () => {
    const c = control([{ name: 'tags', value: 'Compliance Management, Produktbeschreibung ,  Inventories' }]);
    expect(getControlTags(c)).toEqual(['Compliance Management', 'Produktbeschreibung', 'Inventories']);
  });

  it('returns an empty array when there is no tags prop', () => {
    expect(getControlTags(control([]))).toEqual([]);
  });
});

describe('controlHasTag', () => {
  it('matches an exact tag in the list', () => {
    const c = control([{ name: 'tags', value: 'Compliance Management, Produktbeschreibung' }]);
    expect(controlHasTag(c, 'Produktbeschreibung')).toBe(true);
    expect(controlHasTag(c, 'Nope')).toBe(false);
  });
});
