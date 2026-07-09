/**
 * App configuration constants. Decision IDs: ADR-0002, ADR-0005, ADR-0008, ADR-0015, ADR-0029.
 * Deliberately free of `@/assets/*` image imports: e2e specs import this module directly under
 * Node (not through Vite), and a binary asset import here would break that transform (ADR-0029)
 * — asset resolution for HERO_BACKGROUND lives in src/app/heroBackground.ts instead.
 */
import { OSCAL_AUTHORING_VERSION } from '@/models/oscalBase';

/** Vite `base` / GitHub Pages sub-path (mirrors `vite.config.ts`'s `base`, ADR-0002). Kept as a
 * plain constant, not `import.meta.env.BASE_URL` — this module is imported directly under Node
 * by e2e specs (see file-level note above), where Vite's env replacement isn't available. */
export const BASE_PATH = '/talos/';
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

/**
 * Runtime configuration schema (T-025, ADR-0002 §"Runtime requirements"). Aggregates the
 * constants above into the single shape validated at boot (`main.tsx`) — fail fast with a clear
 * error rather than run with a broken value.
 */
export interface TalosConfig {
  basePath: string;
  library: {
    rawBase: string;
  };
  viewerUrl: string;
  defaultLanguage: 'de' | 'en';
  oscalVersion: string;
  backMatter: {
    maxEmbeddedFileBytes: number;
  };
}

/** The app's single validated runtime config instance. */
export const TALOS_CONFIG: TalosConfig = {
  basePath: BASE_PATH,
  library: {
    rawBase: LIBRARY_RAW_BASE,
  },
  viewerUrl: VIEWER_URL,
  defaultLanguage: DEFAULT_LANGUAGE,
  oscalVersion: OSCAL_AUTHORING_VERSION,
  backMatter: {
    maxEmbeddedFileBytes: MAX_EMBEDDED_FILE_BYTES,
  },
};

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Validate a `TalosConfig`, returning every violation found (not just the first) so a boot-time
 * error can list them all at once. An empty array means the config is valid.
 */
export function validateConfig(config: TalosConfig): string[] {
  const errors: string[] = [];

  if (!config.basePath.startsWith('/')) {
    errors.push(`basePath must start with "/", got "${config.basePath}"`);
  }
  if (!isAbsoluteHttpUrl(config.library.rawBase)) {
    errors.push(`library.rawBase must be an absolute http(s) URL, got "${config.library.rawBase}"`);
  }
  if (!isAbsoluteHttpUrl(config.viewerUrl)) {
    errors.push(`viewerUrl must be an absolute http(s) URL, got "${config.viewerUrl}"`);
  }
  if (config.defaultLanguage !== 'de' && config.defaultLanguage !== 'en') {
    errors.push(`defaultLanguage must be "de" or "en", got "${String(config.defaultLanguage)}"`);
  }
  if (config.oscalVersion !== OSCAL_AUTHORING_VERSION) {
    errors.push(
      `oscalVersion must be "${OSCAL_AUTHORING_VERSION}", got "${config.oscalVersion}"`,
    );
  }
  if (
    !Number.isInteger(config.backMatter.maxEmbeddedFileBytes) ||
    config.backMatter.maxEmbeddedFileBytes <= 0
  ) {
    errors.push(
      `backMatter.maxEmbeddedFileBytes must be a positive integer, got ${config.backMatter.maxEmbeddedFileBytes}`,
    );
  }

  return errors;
}
