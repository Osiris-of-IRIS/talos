/**
 * App configuration constants. Decision IDs: ADR-0002, ADR-0005, ADR-0008, ADR-0015.
 * (Full runtime config-schema validation is T-025; these are the current defaults.)
 */
export const VIEWER_URL = 'https://bsi-community.github.io/Stand-der-Technik-Viewer/';
export const DEFAULT_LANGUAGE: 'de' | 'en' = 'de';
export const MAX_EMBEDDED_FILE_BYTES = 5 * 1024 * 1024;

/** Raw base for BSI Stand-der-Technik-Bibliothek content (CORS `*`), used lazily (ADR-0005). */
export const LIBRARY_RAW_BASE =
  'https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/';
/** Licence of the BSI library content (surfaced in the browser + README, ADR-0005). */
export const LIBRARY_LICENSE = 'CC-BY-SA-4.0';

/** Absolute raw URL for a library file path from the manifest (ADR-0005). */
export function libraryRawUrl(path: string): string {
  return LIBRARY_RAW_BASE + path.replace(/^\/+/, '');
}

/**
 * Build the href that opens a catalog in the external Stand-der-Technik-Viewer (ADR-0008).
 * The viewer has no documented per-control deep-link; we open it and (when known) pass the
 * catalog's public URL for its URL-import.
 */
export function viewerHref(catalogPublicUrl?: string): string {
  return catalogPublicUrl ? `${VIEWER_URL}?url=${encodeURIComponent(catalogPublicUrl)}` : VIEWER_URL;
}
