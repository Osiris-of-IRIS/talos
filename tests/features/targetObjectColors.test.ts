/**
 * Target-object-category subtree coloring (ADR-0032 §4): 7 root hex values, lightened per depth.
 * Covers TEST-PROF-07.
 */
import { describe, it, expect } from 'vitest';
import { colorAtDepth, colorForCategory, ROOT_CATEGORY_COLORS } from '@/features/profiles/targetObjectColors';
import { buildCategoryIndex } from '@/data/targetObjectHierarchy';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';

function cat(uuid: string, title: string, parentUuid?: string): TargetObjectCategory {
  return { uuid, title, parentUuid, definition: '', typ: '', category: '', synonyms: '' };
}

describe('colorAtDepth', () => {
  it('returns the root color unchanged at depth 0', () => {
    expect(colorAtDepth('#29A58D', 0)).toBe('#29A58D');
  });

  it('gets strictly lighter at each deeper level', () => {
    const d0 = colorAtDepth('#29A58D', 0);
    const d1 = colorAtDepth('#29A58D', 1);
    const d2 = colorAtDepth('#29A58D', 2);
    const lightness = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
    };
    expect(lightness(d1)).toBeGreaterThan(lightness(d0));
    expect(lightness(d2)).toBeGreaterThan(lightness(d1));
  });

  it('caps lightness so a deep node never washes out to near-white', () => {
    const veryDeep = colorAtDepth('#29A58D', 20);
    const r = parseInt(veryDeep.slice(1, 3), 16);
    const g = parseInt(veryDeep.slice(3, 5), 16);
    const b = parseInt(veryDeep.slice(5, 7), 16);
    expect(Math.max(r, g, b)).toBeLessThan(255);
  });
});

describe('colorForCategory', () => {
  it('resolves a root node to its own pixel-sampled color', () => {
    const standorte = cat('root-1', 'Standorte');
    const byUuid = buildCategoryIndex([standorte]);
    expect(colorForCategory('root-1', byUuid)).toBe(ROOT_CATEGORY_COLORS['Standorte']);
  });

  it('resolves a descendant to a lighter shade of its root', () => {
    const standorte = cat('root-1', 'Standorte');
    const gebaeude = cat('child-1', 'Gebäude', 'root-1');
    const byUuid = buildCategoryIndex([standorte, gebaeude]);
    expect(colorForCategory('child-1', byUuid)).toBe(colorAtDepth(ROOT_CATEGORY_COLORS['Standorte']!, 1));
  });

  it('falls back to a neutral gray for an unknown category', () => {
    expect(colorForCategory('missing', new Map())).toBe('#8a8a8a');
  });
});
