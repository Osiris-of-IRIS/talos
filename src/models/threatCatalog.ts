/**
 * BSI elementary-threats (`Elementare Gefährdungen`) namespace model — the `basethreats.csv`
 * catalog (e.g. "G 0.1" Feuer) that Grundschutz++ catalog controls tag themselves with
 * (`props: [{name:"threats", value:"G 0.18, G 0.19"}]`, ADR-0035). Sourced live from the BSI
 * repo's namespace CSV, same pattern as target-object-category (ADR-0026, ADR-0005).
 */
import { parseCsv } from '@/data/csvParse';

export interface ThreatCatalogEntry {
  /** e.g. "G 0.1" — the literal value controls tag themselves with via their `threats` prop. */
  id: string;
  title: string;
  definition: string;
  uuid: string;
}

/** Parse the BSI `basethreats.csv` namespace file. */
export function parseBasethreatsCsv(text: string): ThreatCatalogEntry[] {
  return parseCsv(text).map((row, i) => {
    const id = row.ID;
    if (!id || id.trim() === '') {
      throw new Error(`basethreats row ${i + 2} is missing an ID.`);
    }
    return {
      id,
      title: row.Begriff ?? '',
      definition: row.Definition ?? '',
      uuid: row.uuid ?? '',
    };
  });
}
