/**
 * BSI Stand-der-Technik-Bibliothek loader (ADR-0005). The manifest (library-index.json) is
 * bundled so the index is available at startup; artifact bodies are fetched lazily from
 * raw.githubusercontent.com, validated (ADR-0003), and cached in IndexedDB keyed by path+sha.
 * Fetches degrade gracefully to cached/offline content with a warning, never a hard crash
 * (ADR-0002). Library artifacts are read-only (origin `library`); `adopt` copies one into the
 * workspace as an editable `user` artifact with a new uuid.
 *
 * Decision IDs: ADR-0005, ADR-0002, ADR-0003, ADR-0004.
 */
import { getDb, type LibraryCacheEntry } from './db';
import { ArtifactRepository } from './artifactRepository';
import { parseOscalDocument } from '@/models/envelope';
import { OSCAL_WRAPPER_KEYS, type OscalArtifactType } from '@/models/oscalBase';
import { libraryRawUrl } from '@/config';
import manifestJson from './library-index.json';

export type LibraryCategory = 'Anwenderkatalog' | 'Quellkatalog' | 'Komponente';

export interface LibraryManifestEntry {
  path: string;
  artifactType: 'catalog' | 'component-definition';
  title: string;
  category: LibraryCategory;
  sha: string;
  size: number;
}

export interface LibraryManifest {
  generatedAt: string;
  source: string;
  ref: string;
  license: string;
  entries: LibraryManifestEntry[];
}

/** The bundled library index (read at startup, ADR-0005). */
export function getLibraryManifest(): LibraryManifest {
  return manifestJson as LibraryManifest;
}

export interface LoadedLibraryArtifact {
  entry: LibraryManifestEntry;
  type: OscalArtifactType;
  /** camelCase app model. */
  artifact: unknown;
  /** raw OSCAL wrapper document as fetched (for provenance / re-parse on adopt). */
  document: unknown;
  fromCache: boolean;
  /** non-blocking warning (e.g. served stale from cache while offline). */
  warning?: string;
}

export interface LibraryDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  backoffMs?: number;
  now?: () => string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url: string, deps: LibraryDeps): Promise<unknown> {
  const f = deps.fetch ?? globalThis.fetch;
  if (!f) throw new Error('No fetch implementation available.');
  const retries = deps.retries ?? 2;
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const backoffMs = deps.backoffMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await f(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as unknown;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await delay(backoffMs * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function getCached(path: string): Promise<LibraryCacheEntry | undefined> {
  const db = await getDb();
  return db.get('libraryCache', path);
}

async function putCached(entry: LibraryCacheEntry): Promise<void> {
  const db = await getDb();
  await db.put('libraryCache', entry);
}

/** Validate a fetched document and confirm it is the artifact type the manifest promised. */
function parseAndCheck(entry: LibraryManifestEntry, document: unknown) {
  const { type, artifact } = parseOscalDocument(document);
  if (OSCAL_WRAPPER_KEYS[type] !== entry.artifactType) {
    throw new Error(
      `Library file ${entry.path} is a ${OSCAL_WRAPPER_KEYS[type]}, expected ${entry.artifactType}.`,
    );
  }
  return { type, artifact };
}

/**
 * Load a library artifact: cache hit by path+sha, else fetch + validate + cache. On a fetch
 * failure, fall back to any cached copy (even a stale sha) with a warning; only throw when there
 * is nothing cached.
 */
export async function loadLibraryArtifact(
  entry: LibraryManifestEntry,
  deps: LibraryDeps = {},
): Promise<LoadedLibraryArtifact> {
  const now = deps.now ?? (() => new Date().toISOString());
  const cached = await getCached(entry.path);
  if (cached && cached.sha === entry.sha) {
    const { type, artifact } = parseAndCheck(entry, cached.document);
    return { entry, type, artifact, document: cached.document, fromCache: true };
  }

  try {
    const document = await fetchJsonWithRetry(libraryRawUrl(entry.path), deps);
    const { type, artifact } = parseAndCheck(entry, document);
    await putCached({
      path: entry.path,
      sha: entry.sha,
      artifactType: type,
      title: entry.title,
      fetchedAt: now(),
      document,
    });
    return { entry, type, artifact, document, fromCache: false };
  } catch (fetchErr) {
    if (cached) {
      const { type, artifact } = parseAndCheck(entry, cached.document);
      return {
        entry,
        type,
        artifact,
        document: cached.document,
        fromCache: true,
        warning: `Offline: showing a cached copy of "${entry.title}" (${cached.sha === entry.sha ? 'current' : 'possibly outdated'}).`,
      };
    }
    throw new Error(
      `Could not load "${entry.title}" from the BSI library and no cached copy exists: ${
        fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      }`,
    );
  }
}

/**
 * Adopt a loaded library artifact into the workspace: a fresh copy with a new uuid and
 * `origin: user` so it is editable (ADR-0005). Returns the new uuid.
 */
export async function adoptLibraryArtifact(loaded: LoadedLibraryArtifact): Promise<string> {
  const { type, document } = loaded;
  const { artifact } = parseOscalDocument<{ uuid: string }>(document);
  const uuid = globalThis.crypto.randomUUID();
  artifact.uuid = uuid;
  await ArtifactRepository.forType<{ uuid: string }>(type).create({
    uuid,
    type,
    origin: 'user',
    artifact,
  });
  return uuid;
}
