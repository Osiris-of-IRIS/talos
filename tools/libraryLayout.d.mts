// Type declarations for tools/libraryLayout.mjs (plain Node ESM, imported by vitest). ADR-0039.
export interface LibraryTreeFile {
  path: string;
  sha: string;
  size: number;
}

export interface LibraryIndexEntry {
  path: string;
  artifactType: string;
  title: string;
  category: string;
  sha: string;
  size: number;
}

export interface LibraryIndex {
  generatedAt: string;
  source: string;
  ref: string;
  commit: string;
  license: string;
  note: string;
  namespaces: { targetObjectCategories: string; threats: string };
  entries: LibraryIndexEntry[];
  skipped?: string[];
}

export const OSCAL_LAYERS: string[];
export const NAMESPACE_FILES: { targetObjectCategories: string; threats: string };

export function classifyLibraryFile(
  path: string,
): { artifactType: string; resolved: boolean; suffix: string } | null;
export function titleFromPath(path: string, suffix: string): string;
export function referencedCatalogPaths(profilePath: string, profileDoc: unknown): string[];
export function findNamespacePaths(files: { path: string }[]): { targetObjectCategories: string; threats: string };
export function buildLibraryIndex(input: {
  files: LibraryTreeFile[];
  profiles: Map<string, unknown>;
  source: string;
  ref: string;
  commit: string;
  generatedAt: string;
}): LibraryIndex;
export function encodeRepoPath(path: string): string;
export function libraryCheckTargets(
  index: { entries: { path: string; title: string }[]; namespaces: Record<string, string> },
  rawBase: string,
): { label: string; path: string; url: string }[];
