/**
 * App configuration constants. Decision IDs: ADR-0002, ADR-0005, ADR-0008, ADR-0015, ADR-0029.
 * (Full runtime config-schema validation is T-025; these are the current defaults.)
 * Deliberately free of `@/assets/*` image imports: e2e specs import this module directly under
 * Node (not through Vite), and a binary asset import here would break that transform (ADR-0029)
 * — asset resolution for HERO_BACKGROUND lives in src/app/heroBackground.ts instead.
 */
export const VIEWER_URL = 'https://bsi-community.github.io/Stand-der-Technik-Viewer/';
export const DEFAULT_LANGUAGE: 'de' | 'en' = 'de';
export const MAX_EMBEDDED_FILE_BYTES = 5 * 1024 * 1024;

/** Raw base for BSI Stand-der-Technik-Bibliothek content (CORS `*`), used lazily (ADR-0005). */
export const LIBRARY_RAW_BASE =
  'https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/';
/** Licence of the BSI library content (surfaced in the browser + README, ADR-0005). */
export const LIBRARY_LICENSE = 'CC-BY-SA-4.0';

/** BSI target-object-category (Zielobjektkategorie) namespace CSV, live-fetched (ADR-0026). */
export const TARGET_OBJECT_CATEGORIES_URL =
  'https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/refs/heads/main/Dokumentation/namespaces/target_object_categories.csv';

/** Absolute raw URL for a library file path from the manifest (ADR-0005). */
export function libraryRawUrl(path: string): string {
  return LIBRARY_RAW_BASE + path.replace(/^\/+/, '');
}

/** The two hero backgrounds supplied for the landing page (ADR-0029); resolved to an asset URL
 * by src/app/heroBackground.ts (kept out of this module — see the file-level note above). */
export type HeroBackgroundKey = 'epic' | 'simple';

/**
 * Which hero background the landing page shows — a single global choice for every user, not a
 * per-user preference (ADR-0029). Change this constant and redeploy to switch it app-wide.
 */
export const HERO_BACKGROUND: HeroBackgroundKey = 'epic';

/**
 * Build the href that opens a catalog in the external Stand-der-Technik-Viewer (ADR-0008).
 * The viewer has no documented per-control deep-link; we open it and (when known) pass the
 * catalog's public URL for its URL-import.
 */
export function viewerHref(catalogPublicUrl?: string): string {
  return catalogPublicUrl ? `${VIEWER_URL}?url=${encodeURIComponent(catalogPublicUrl)}` : VIEWER_URL;
}
