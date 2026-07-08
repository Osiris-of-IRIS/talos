/**
 * CSV write-side helper (RFC4180 quoting): the inverse of `csvParse.ts`, used to export data back
 * to the same CSV shape it was imported from (e.g. selected assets, ADR-0027).
 */

/** Quote a field only when it contains a comma, quote, or newline; doubles internal quotes. */
export function stringifyCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Write a header row followed by one row per record (in header order), CRLF-free (`\n`). */
export function stringifyCsv(header: string[], rows: Record<string, string>[]): string {
  const lines = [header.map(stringifyCsvField).join(',')];
  for (const row of rows) {
    lines.push(header.map((key) => stringifyCsvField(row[key] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}
