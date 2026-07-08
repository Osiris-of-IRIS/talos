/**
 * CSV parser — RFC4180-ish (quoted fields, embedded commas/quotes, embedded newlines).
 * Decision IDs: ADR-0004, ADR-0026 (asset-list / target-object-category ingestion).
 * Covers TEST-ASSET-02.
 */
import { describe, it, expect } from 'vitest';
import { parseCsv } from '@/data/csvParse';

describe('parseCsv', () => {
  it('parses a simple header + rows into an array of records', () => {
    const rows = parseCsv('uuid,title\nclient-pc,Desktop-PC (Client)\nlaptop,Laptop\n');
    expect(rows).toEqual([
      { uuid: 'client-pc', title: 'Desktop-PC (Client)' },
      { uuid: 'laptop', title: 'Laptop' },
    ]);
  });

  it('handles quoted fields containing commas', () => {
    const rows = parseCsv('uuid,name\nC001,"Clients der Finanzbuchhaltung, Abteilung Süd"\n');
    expect(rows[0]!.name).toBe('Clients der Finanzbuchhaltung, Abteilung Süd');
  });

  it('handles doubled-quote escaping inside a quoted field', () => {
    const rows = parseCsv('uuid,definition\nx,"Ein ""Zentral"" gemeinter Dienst."\n');
    expect(rows[0]!.definition).toBe('Ein "Zentral" gemeinter Dienst.');
  });

  it('handles embedded newlines inside a quoted field', () => {
    const rows = parseCsv('uuid,notes\nx,"line one\nline two"\n');
    expect(rows[0]!.notes).toBe('line one\nline two');
  });

  it('tolerates CRLF line endings', () => {
    const rows = parseCsv('uuid,title\r\nclient-pc,Desktop\r\n');
    expect(rows).toEqual([{ uuid: 'client-pc', title: 'Desktop' }]);
  });

  it('ignores a trailing blank line', () => {
    const rows = parseCsv('uuid,title\nclient-pc,Desktop\n\n');
    expect(rows).toHaveLength(1);
  });

  it('fills a missing trailing column with an empty string', () => {
    const rows = parseCsv('uuid,title,synonyms\nclient-pc,Desktop,\n');
    expect(rows[0]).toEqual({ uuid: 'client-pc', title: 'Desktop', synonyms: '' });
  });

  it('throws when a row has more fields than the header', () => {
    expect(() => parseCsv('a,b\n1,2,3\n')).toThrow(/column/i);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   \n')).toEqual([]);
  });

  it('parses the real BSI target-object-category row shape end to end', () => {
    const csv =
      'Zielobjekt,Definition,Typ,Kategorie,Synonyme,ChildOfUUID,UUID\n' +
      'Anwendungen,"Anwendungen sind Funktionseinheiten, die eine Aufgabe erbringen.",Anwendungen,Technisch,Apps,,7e41ecf5-1831-4691-ad0c-4fc7bbc1b871\n';
    const rows = parseCsv(csv);
    expect(rows).toEqual([
      {
        Zielobjekt: 'Anwendungen',
        Definition: 'Anwendungen sind Funktionseinheiten, die eine Aufgabe erbringen.',
        Typ: 'Anwendungen',
        Kategorie: 'Technisch',
        Synonyme: 'Apps',
        ChildOfUUID: '',
        UUID: '7e41ecf5-1831-4691-ad0c-4fc7bbc1b871',
      },
    ]);
  });
});
