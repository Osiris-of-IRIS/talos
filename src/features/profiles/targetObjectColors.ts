/**
 * Target-object-category subtree colors for the Profile Creation Assistant's picker (ADR-0032
 * §4). Pixel-sampled from the supplied reference image: 7 root hex values, one per top-level
 * BSI target-object-category, with the whole subtree rendered at the *same hue* and increasing
 * *lightness* per depth — not a hardcoded color per node. That distinction matters because the
 * hierarchy itself is live-fetched CSV data (ADR-0026): a per-node color table would drift the
 * moment BSI adds or renumbers a category; a depth-indexed ramp derived from 7 stable root titles
 * never can. This is a derived approximation of the reference image, not a pixel-exact
 * reproduction of all 41 nodes (ADR-0032 Consequences).
 */
import type { TargetObjectCategory } from '@/models/targetObjectCategory';
import { ancestorChain } from '@/data/targetObjectHierarchy';

/** Root category title -> pixel-sampled hex (ADR-0032 §4). */
export const ROOT_CATEGORY_COLORS: Record<string, string> = {
  Standorte: '#29A58D',
  Nutzende: '#E48734',
  Netze: '#9552B1',
  'IT-Systeme': '#2E9F92',
  Informationen: '#EE9616',
  Einkäufe: '#A74A7C',
  Anwendungen: '#3F8EAF',
};

/** Lightness added per hierarchy level below the root, and the ceiling that caps it. */
const LIGHTNESS_STEP_PERCENT = 10;
const MAX_LIGHTNESS_PERCENT = 82;

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      break;
    case g:
      h = ((b - r) / d + 2) * 60;
      break;
    default:
      h = ((r - g) / d + 4) * 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex({ h, s, l }: Hsl): string {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** The root category's own hex, lightened by `depth` hierarchy levels below it (depth 0 = root itself). */
export function colorAtDepth(rootHex: string, depth: number): string {
  const hsl = hexToHsl(rootHex);
  const l = Math.min(hsl.l + depth * LIGHTNESS_STEP_PERCENT, MAX_LIGHTNESS_PERCENT);
  return hslToHex({ ...hsl, l });
}

/**
 * Resolve a category's subtree color: walk its ancestor chain (ADR-0026's `ancestorChain`) to
 * find the root category, look up that root's pixel-sampled hex, and lighten by the category's
 * own depth below it. Falls back to a neutral gray for a root not in `ROOT_CATEGORY_COLORS`
 * (defensive — every real BSI root is listed above) or an unknown uuid.
 */
export function colorForCategory(
  categoryUuid: string,
  byUuid: Map<string, TargetObjectCategory>,
): string {
  const chain = ancestorChain(categoryUuid, byUuid);
  const rootUuid = chain[chain.length - 1];
  const root = rootUuid ? byUuid.get(rootUuid) : undefined;
  const rootHex = root ? ROOT_CATEGORY_COLORS[root.title] : undefined;
  if (!rootHex) return '#8a8a8a';
  return colorAtDepth(rootHex, chain.length - 1);
}
