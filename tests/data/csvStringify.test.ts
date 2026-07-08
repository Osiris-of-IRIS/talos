/**
 * CSV write-side helper (RFC4180 quoting) — the inverse of csvParse.ts, used to export selected
 * assets back to their CSV shape (ADR-0027).
 * Covers TEST-BULK-01.
 */
import { describe, it, expect } from 'vitest';
import { stringifyCsv, stringifyCsvField } from '@/data/csvStringify';
import { parseCsv } from '@/data/csvParse';

describe('stringifyCsvField', () => {
  it('leaves a plain field unquoted', () => {
    expect(stringifyCsvField('Desktop')).toBe('Desktop');
  });

  it('quotes a field containing a comma', () => {
    expect(stringifyCsvField('Finanzbuchhaltung, Abteilung Süd')).toBe(
      '"Finanzbuchhaltung, Abteilung Süd"',
    );
  });

  it('quotes and doubles internal quotes', () => {
    expect(stringifyCsvField('Ein "Zentral" gemeinter Dienst.')).toBe(
      '"Ein ""Zentral"" gemeinter Dienst."',
    );
  });

  it('quotes a field containing a newline', () => {
    expect(stringifyCsvField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('does not quote an empty field', () => {
    expect(stringifyCsvField('')).toBe('');
  });
});

describe('stringifyCsv', () => {
  it('writes a header row followed by one row per record, in header order', () => {
    const csv = stringifyCsv(
      ['uuid', 'title'],
      [
        { uuid: 'client-pc', title: 'Desktop-PC (Client)' },
        { uuid: 'laptop', title: 'Laptop' },
      ],
    );
    expect(csv).toBe('uuid,title\nclient-pc,Desktop-PC (Client)\nlaptop,Laptop\n');
  });

  it('round-trips through parseCsv unchanged', () => {
    const records = [
      { uuid: 'C001', name: 'Clients der Finanzbuchhaltung, Süd', description: 'Ein "besonderer" Fall' },
      { uuid: 'C002', name: 'Normal', description: '' },
    ];
    const csv = stringifyCsv(['uuid', 'name', 'description'], records);
    expect(parseCsv(csv)).toEqual(records);
  });
});
