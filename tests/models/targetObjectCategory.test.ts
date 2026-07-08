/**
 * BSI target-object-category (Zielobjektkategorie) namespace model — ADR-0026.
 * Covers TEST-TOC-01.
 */
import { describe, it, expect } from 'vitest';
import { parseTargetObjectCategoriesCsv } from '@/models/targetObjectCategory';

const CSV =
  'Zielobjekt,Definition,Typ,Kategorie,Synonyme,ChildOfUUID,UUID\n' +
  'Anwendungen,"Funktionseinheiten, die eine Aufgabe erbringen.",Anwendungen,Technisch,Apps,,7e41ecf5-1831-4691-ad0c-4fc7bbc1b871\n' +
  'Webserver,"Server-Anwendungen, die HTTP(S) bereitstellen.",Anwendungen,Technisch,,7e41ecf5-1831-4691-ad0c-4fc7bbc1b871,b1411d0f-ffd1-45b7-837b-cd97ba4ed9e7\n' +
  'Webanwendungen,"Dynamische Inhalte über HTTP(S).",Anwendungen,Technisch,,b1411d0f-ffd1-45b7-837b-cd97ba4ed9e7,36cb0d6b-2f90-43bc-b625-9870112cf847\n';

describe('parseTargetObjectCategoriesCsv', () => {
  it('parses rows into camelCase TargetObjectCategory records', () => {
    const rows = parseTargetObjectCategoriesCsv(CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      title: 'Anwendungen',
      definition: 'Funktionseinheiten, die eine Aufgabe erbringen.',
      typ: 'Anwendungen',
      category: 'Technisch',
      synonyms: 'Apps',
      parentUuid: undefined,
      uuid: '7e41ecf5-1831-4691-ad0c-4fc7bbc1b871',
    });
  });

  it('leaves a root row (empty ChildOfUUID) with parentUuid undefined', () => {
    const rows = parseTargetObjectCategoriesCsv(CSV);
    expect(rows.find((r) => r.title === 'Anwendungen')?.parentUuid).toBeUndefined();
  });

  it('captures the parent chain via ChildOfUUID', () => {
    const rows = parseTargetObjectCategoriesCsv(CSV);
    expect(rows.find((r) => r.title === 'Webserver')?.parentUuid).toBe('7e41ecf5-1831-4691-ad0c-4fc7bbc1b871');
    expect(rows.find((r) => r.title === 'Webanwendungen')?.parentUuid).toBe('b1411d0f-ffd1-45b7-837b-cd97ba4ed9e7');
  });

  it('throws on a row missing a UUID', () => {
    expect(() => parseTargetObjectCategoriesCsv('Zielobjekt,UUID\nX,\n')).toThrow(/uuid/i);
  });
});
