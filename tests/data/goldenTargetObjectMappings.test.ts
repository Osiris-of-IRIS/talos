/**
 * Golden-data contract: the recplast asset-type -> target-object-category mappings must reference
 * categories that exist in the BSI upstream hierarchy (snapshot tests/data/bsi/, commit c3f3785),
 * and must stay semantically right after BSI's in-place rename of uuid 837781a4 from "Endgeräte"
 * to "Mobile Endgeräte" (ADR-0039). Asset matching is uuid-based end to end up to the hierarchy;
 * only the final hop to catalog controls is by title, because BSI catalogs tag controls by title.
 * Decision IDs: ADR-0001, ADR-0026, ADR-0039.
 * Covers TEST-TOC-05.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAssetTypeMappingsCsv } from '@/models/asset';
import { parseTargetObjectCategoriesCsv } from '@/models/targetObjectCategory';
import { buildCategoryIndex, categoryTitlesInChain } from '@/data/targetObjectHierarchy';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf-8');
const rows = parseTargetObjectCategoriesCsv(read('bsi/target_object_categories.csv'));
const byUuid = buildCategoryIndex(rows);
const mappings = parseAssetTypeMappingsCsv(read('golden/recplast/mappings.csv'));

const MOBILE_ENDGERAETE = '837781a4-7b47-4695-9545-a3310eac7a66';
const IT_SYSTEME = '427da6dd-d744-4b2b-88b7-f0a695f21e14';

describe('golden recplast mappings vs. BSI upstream hierarchy (TEST-TOC-05)', () => {
  it('references only target-object categories present upstream', () => {
    const missing = [...mappings].filter(([, uuid]) => !byUuid.has(uuid)).map(([type]) => type);
    expect(missing).toEqual([]);
  });

  it('confirms the upstream rename this ticket reacts to (same uuid, new title)', () => {
    expect(byUuid.get(MOBILE_ENDGERAETE)?.title).toBe('Mobile Endgeräte');
    expect(rows.some((r) => r.title === 'Endgeräte')).toBe(false);
  });

  it('maps laptops to "Mobile Endgeräte" but desktop PCs to the IT-Systeme parent, not to mobile devices', () => {
    expect(mappings.get('laptop')).toBe(MOBILE_ENDGERAETE);
    expect(mappings.get('client-pc')).toBe(IT_SYSTEME);
    expect(categoryTitlesInChain(mappings.get('client-pc')!, byUuid)).toEqual(['IT-Systeme']);
  });
});
