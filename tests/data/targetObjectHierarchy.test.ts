/**
 * Target-object-category ancestor-chain matching against catalog controls (ADR-0026). UUIDs and
 * the Anwendungen -> Webserver -> Webanwendungen chain are the real BSI values, verified against
 * the live target_object_categories.csv namespace file.
 * Covers TEST-TOC-03.
 */
import { describe, it, expect } from 'vitest';
import {
  buildCategoryIndex,
  ancestorChain,
  categoryTitlesInChain,
  controlTargetCategories,
  controlMatchesCategoryOrAncestor,
  hasNoTargetObjectCategory,
} from '@/data/targetObjectHierarchy';
import type { TargetObjectCategory } from '@/models/targetObjectCategory';
import type { Control } from '@/models/control';
import catalogDoc from './catalog-target-object-categories.json';

const ROWS: TargetObjectCategory[] = [
  {
    title: 'Anwendungen',
    definition: '',
    typ: 'Anwendungen',
    category: 'Technisch',
    synonyms: '',
    parentUuid: undefined,
    uuid: '7e41ecf5-1831-4691-ad0c-4fc7bbc1b871',
  },
  {
    title: 'Webserver',
    definition: '',
    typ: 'Anwendungen',
    category: 'Technisch',
    synonyms: '',
    parentUuid: '7e41ecf5-1831-4691-ad0c-4fc7bbc1b871',
    uuid: 'b1411d0f-ffd1-45b7-837b-cd97ba4ed9e7',
  },
  {
    title: 'Webanwendungen',
    definition: '',
    typ: 'Anwendungen',
    category: 'Technisch',
    synonyms: '',
    parentUuid: 'b1411d0f-ffd1-45b7-837b-cd97ba4ed9e7',
    uuid: '36cb0d6b-2f90-43bc-b625-9870112cf847',
  },
  {
    title: 'IT-Systeme',
    definition: '',
    typ: 'IT-Systeme',
    category: 'Technisch',
    synonyms: '',
    parentUuid: undefined,
    uuid: '427da6dd-d744-4b2b-88b7-f0a695f21e14',
  },
  {
    title: 'Hostsysteme',
    definition: '',
    typ: 'IT-Systeme',
    category: 'Technisch',
    synonyms: '',
    parentUuid: '427da6dd-d744-4b2b-88b7-f0a695f21e14',
    uuid: '19c946fc-e991-44ee-87c5-7bbe5d5aaf55',
  },
];

const webanwendungenUuid = '36cb0d6b-2f90-43bc-b625-9870112cf847';

const catalog = catalogDoc.catalog;
function findControl(id: string): Control {
  for (const g of catalog.groups) {
    const c = g.controls.find((c) => c.id === id);
    if (c) return c as unknown as Control;
  }
  throw new Error(`fixture control ${id} not found`);
}

describe('ancestorChain', () => {
  it('walks ChildOfUUID up to the root, self included', () => {
    const byUuid = buildCategoryIndex(ROWS);
    expect(ancestorChain(webanwendungenUuid, byUuid)).toEqual([
      '36cb0d6b-2f90-43bc-b625-9870112cf847', // Webanwendungen
      'b1411d0f-ffd1-45b7-837b-cd97ba4ed9e7', // Webserver
      '7e41ecf5-1831-4691-ad0c-4fc7bbc1b871', // Anwendungen
    ]);
  });

  it('returns just the uuid itself for a root category', () => {
    const byUuid = buildCategoryIndex(ROWS);
    expect(ancestorChain('7e41ecf5-1831-4691-ad0c-4fc7bbc1b871', byUuid)).toEqual([
      '7e41ecf5-1831-4691-ad0c-4fc7bbc1b871',
    ]);
  });
});

describe('categoryTitlesInChain', () => {
  it('resolves the ancestor chain to titles ("Webanwendungen", "Webserver" or "Anwendungen" per the ticket example)', () => {
    const byUuid = buildCategoryIndex(ROWS);
    expect(categoryTitlesInChain(webanwendungenUuid, byUuid)).toEqual([
      'Webanwendungen',
      'Webserver',
      'Anwendungen',
    ]);
  });
});

describe('controlTargetCategories', () => {
  it('reads a category tagged on the control itself', () => {
    expect(controlTargetCategories(findControl('APP.1.1.2'))).toEqual(['Anwendungen']);
  });

  it('reads a category tagged on a nested statement part', () => {
    expect(controlTargetCategories(findControl('APP.1.1.1'))).toEqual(['Webanwendungen']);
  });

  it('returns an empty array for a control with no target_object_categories prop anywhere', () => {
    expect(controlTargetCategories(findControl('ISMS.1.1.1'))).toEqual([]);
  });
});

describe('hasNoTargetObjectCategory', () => {
  it('is true only for controls with no target_object_categories tag (ISMS scope)', () => {
    expect(hasNoTargetObjectCategory(findControl('ISMS.1.1.1'))).toBe(true);
    expect(hasNoTargetObjectCategory(findControl('APP.1.1.1'))).toBe(false);
  });
});

describe('controlMatchesCategoryOrAncestor', () => {
  it('matches a control tagged with the asset category itself', () => {
    const byUuid = buildCategoryIndex(ROWS);
    expect(controlMatchesCategoryOrAncestor(findControl('APP.1.1.1'), webanwendungenUuid, byUuid)).toBe(true);
  });

  it('matches a control tagged with an ancestor category (Anwendungen is an ancestor of Webanwendungen)', () => {
    const byUuid = buildCategoryIndex(ROWS);
    expect(controlMatchesCategoryOrAncestor(findControl('APP.1.1.2'), webanwendungenUuid, byUuid)).toBe(true);
  });

  it('does not match a control tagged with an unrelated category', () => {
    const byUuid = buildCategoryIndex(ROWS);
    expect(controlMatchesCategoryOrAncestor(findControl('SYS.1.1.1'), webanwendungenUuid, byUuid)).toBe(false);
  });

  it('does not match a control with no target_object_categories tag', () => {
    const byUuid = buildCategoryIndex(ROWS);
    expect(controlMatchesCategoryOrAncestor(findControl('ISMS.1.1.1'), webanwendungenUuid, byUuid)).toBe(false);
  });
});
