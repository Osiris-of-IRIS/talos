/**
 * BSI target-object-category (Zielobjektkategorie) namespace model — the Grundschutz++ hierarchy
 * of asset categories (Endgeräte, Hostsysteme, Anwendungen, …) that BSI catalog controls tag
 * themselves with (`props: [{name:"target_object_categories", value:"<title>"}]`). Sourced live
 * from the BSI repo's namespace CSV (ADR-0026, ADR-0005's live-fetch precedent).
 */
import { parseCsv } from '@/data/csvParse';

export interface TargetObjectCategory {
  /** German category name (`Zielobjekt`) — this is the literal value controls tag themselves with. */
  title: string;
  definition: string;
  typ: string;
  category: string;
  synonyms: string;
  /** Parent category uuid (`ChildOfUUID`), absent for a hierarchy root. */
  parentUuid: string | undefined;
  uuid: string;
}

/** Parse the BSI `target_object_categories.csv` namespace file. */
export function parseTargetObjectCategoriesCsv(text: string): TargetObjectCategory[] {
  return parseCsv(text).map((row, i) => {
    const uuid = row.UUID;
    if (!uuid || uuid.trim() === '') {
      throw new Error(`target-object-categories row ${i + 2} is missing a UUID.`);
    }
    return {
      title: row.Zielobjekt ?? '',
      definition: row.Definition ?? '',
      typ: row.Typ ?? '',
      category: row.Kategorie ?? '',
      synonyms: row.Synonyme ?? '',
      parentUuid: row.ChildOfUUID && row.ChildOfUUID.trim() !== '' ? row.ChildOfUUID : undefined,
      uuid,
    };
  });
}
