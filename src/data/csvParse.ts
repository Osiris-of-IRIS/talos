/**
 * Minimal RFC4180-style CSV parser: quoted fields, doubled-quote escaping, embedded commas and
 * newlines. Used to ingest the asset-list golden-data CSVs and the BSI target-object-category
 * namespace CSV (ADR-0026). No external dependency — the inputs are small (tens to low hundreds
 * of rows) and the quoting rules are the only real complexity.
 */

interface RawRow {
  fields: string[];
  /** 1-based physical line number the row starts on, for accurate error reporting. */
  line: number;
}

/** Split CSV text into rows of raw string fields (with physical line numbers), honoring RFC4180 quoting. */
function splitRows(text: string): RawRow[] {
  const rows: RawRow[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  let line = 1;
  let rowStartLine = 1;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push({ fields: row, line: rowStartLine });
    row = [];
    rowStartLine = line;
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (c === '\n') line++;
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      endField();
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      line++;
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Final field/row, if the input didn't end with a newline.
  if (field.length > 0 || row.length > 0) endRow();

  return rows;
}

/** Parse CSV text (with a header row) into an array of `header → value` records. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = splitRows(text).filter(
    (r) => !(r.fields.length === 1 && (r.fields[0] ?? '').trim() === ''),
  );
  if (rows.length === 0) return [];
  const [headerRow, ...dataRows] = rows;
  const header = headerRow?.fields ?? [];

  const seen = new Set<string>();
  for (const key of header) {
    if (seen.has(key)) {
      throw new Error(`CSV header has a duplicate column "${key}" (header: ${header.join(', ')}).`);
    }
    seen.add(key);
  }

  return dataRows.map(({ fields: row, line }) => {
    if (row.length > header.length) {
      throw new Error(
        `CSV row ${line} has ${row.length} columns, expected ${header.length} (header: ${header.join(', ')}).`,
      );
    }
    const record: Record<string, string> = {};
    header.forEach((key, colIndex) => {
      record[key] = row[colIndex] ?? '';
    });
    return record;
  });
}
