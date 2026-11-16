/**
 * BSI Stand-der-Technik-Bibliothek upstream layout knowledge (ADR-0039, ADR-0005), shared by
 * tools/gen-library-index.mjs (index generation), tools/check-library.mjs (upstream drift check)
 * and the unit tests (TEST-LIB-04). Pure functions only: no network, no filesystem.
 *
 * Upstream layout (main @ c3f3785, 2026-10-30):
 *
 *   control_layer/<Name>/<Name>-resolved_catalog.json         resolved user catalog  -> Anwenderkatalog
 *   control_layer/<Name>/sources/profiles/<Name>-profile.json profile over sources    -> Profil
 *   control_layer/**\/…-catalog.json imported by a profile     source catalog         -> Quellkatalog
 *   control_layer/**\/…-catalog.json not imported by a profile standalone catalog     -> Anwenderkatalog
 *   control_layer/Mappings/**\/…-mapping_collection.json      OSCAL mapping model    -> Mapping
 *   implementation_layer/**\/…-component_definition.json      component-definition   -> Komponente
 *   assessment_layer/**                                        (nothing published yet) -> Assessment
 *   documentation/namespaces/*.csv                             namespace CSVs (located by file name)
 *
 * Classification is by file-name suffix inside the three OSCAL layer folders, so a rename or move
 * *within* a layer is picked up by simply regenerating the index. The Anwender-/Quellkatalog split
 * is derived from the data (which catalogs BSI's own profiles import), not from folder names.
 *
 * Decision IDs: ADR-0005, ADR-0039.
 */

export const OSCAL_LAYERS = ['control_layer', 'implementation_layer', 'assessment_layer'];

/** Namespace CSVs TALOS reads, located anywhere in the tree by their (stable) file name. */
export const NAMESPACE_FILES = {
  targetObjectCategories: 'target_object_categories.csv',
  threats: 'basethreats.csv',
};

/**
 * File-name suffix -> OSCAL root key. Order matters: `-resolved_catalog` before `-catalog`.
 * Assessment-layer suffixes are anticipated (BSI's naming pattern), not yet seen upstream.
 */
const SUFFIXES = [
  ['-resolved_catalog.json', 'catalog', true],
  ['-catalog.json', 'catalog', false],
  ['-profile.json', 'profile', false],
  ['-component_definition.json', 'component-definition', false],
  ['-mapping_collection.json', 'mapping-collection', false],
  ['-assessment_plan.json', 'assessment-plan', false],
  ['-assessment_results.json', 'assessment-results', false],
  ['-poam.json', 'plan-of-action-and-milestones', false],
  ['-plan_of_action_and_milestones.json', 'plan-of-action-and-milestones', false],
  ['-system_security_plan.json', 'system-security-plan', false],
  ['-ssp.json', 'system-security-plan', false],
];

/**
 * Classify one repo path. Returns `{ artifactType, resolved, suffix }` for an OSCAL artifact in
 * one of the layer folders, or `null` for anything else (docs, schemas, CSVs, legacy layout).
 * @param {string} path
 */
export function classifyLibraryFile(path) {
  const top = path.split('/')[0];
  if (!OSCAL_LAYERS.includes(top)) return null;
  for (const [suffix, artifactType, resolved] of SUFFIXES) {
    if (path.endsWith(suffix)) return { artifactType, resolved, suffix };
  }
  return null;
}

/** Display title from the file name: suffix stripped, `-`/`_` as spaces (stable, unlike metadata titles, which BSI repeats across a profile and its resolved catalog). */
export function titleFromPath(path, suffix) {
  return path
    .split('/')
    .pop()
    .slice(0, -suffix.length)
    .replace(/[-_]+/g, ' ')
    .trim();
}

/** POSIX-style join + normalisation of `..`/`.` segments, relative to a repo-root path. */
function resolveRelative(fromFile, rel) {
  const parts = fromFile.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Repo paths of the catalogs a BSI profile imports, from its back-matter `rlinks` (BSI uses
 * relative paths such as `../../../Kernel/BSI-Stand-der-Technik-Kernel-catalog.json`). Absolute
 * URLs (external references, pinned GitHub blob links) are ignored.
 * @param {string} profilePath repo path of the profile file
 * @param {unknown} profileDoc parsed profile JSON (`{ profile: {...} }`)
 * @returns {string[]}
 */
export function referencedCatalogPaths(profilePath, profileDoc) {
  const resources = profileDoc?.profile?.['back-matter']?.resources ?? [];
  const out = new Set();
  for (const r of resources) {
    for (const link of r?.rlinks ?? []) {
      const href = typeof link?.href === 'string' ? link.href : '';
      if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
      if (!href.endsWith('.json')) continue;
      out.add(resolveRelative(profilePath, decodeURIComponent(href)));
    }
  }
  return [...out];
}

/**
 * Locate the namespace CSVs by file name. Throws when one is missing: an index without them
 * would silently break bootstrap/Profile Assistant/Risk Coverage (the 2026-11 outage).
 * @param {{ path: string }[]} files
 */
export function findNamespacePaths(files) {
  const out = {};
  for (const [key, name] of Object.entries(NAMESPACE_FILES)) {
    const hits = files.map((f) => f.path).filter((p) => p.split('/').pop() === name);
    if (hits.length === 0) {
      throw new Error(`Namespace file ${name} not found in the BSI library tree — upstream moved or renamed it.`);
    }
    // Prefer the documentation/namespaces location if BSI ever ships copies elsewhere.
    hits.sort((a, b) => Number(b.includes('/namespaces/')) - Number(a.includes('/namespaces/')) || a.localeCompare(b));
    out[key] = hits[0];
  }
  return out;
}

/** Category for an artifact type (catalogs are decided by `buildLibraryIndex`). */
const CATEGORY_BY_TYPE = {
  profile: 'Profil',
  'component-definition': 'Komponente',
  'mapping-collection': 'Mapping',
  'assessment-plan': 'Assessment',
  'assessment-results': 'Assessment',
  'plan-of-action-and-milestones': 'Assessment',
  'system-security-plan': 'Assessment',
};

/**
 * Build the library manifest from a flat file listing (`{path, sha, size}` per blob, as from the
 * Git Trees API or `git ls-tree -r -l`) plus the parsed profile documents.
 * @param {{
 *   files: { path: string, sha: string, size: number }[],
 *   profiles: Map<string, unknown>,
 *   source: string, ref: string, commit: string, generatedAt: string,
 * }} input
 */
export function buildLibraryIndex({ files, profiles, source, ref, commit, generatedAt }) {
  const sourceCatalogs = new Set();
  for (const [profilePath, doc] of profiles) {
    for (const p of referencedCatalogPaths(profilePath, doc)) sourceCatalogs.add(p);
  }

  const entries = [];
  const skipped = [];
  for (const f of files) {
    const cls = classifyLibraryFile(f.path);
    if (!cls) {
      if (OSCAL_LAYERS.includes(f.path.split('/')[0]) && f.path.endsWith('.json')) skipped.push(f.path);
      continue;
    }
    let category = CATEGORY_BY_TYPE[cls.artifactType] ?? 'Sonstiges';
    if (cls.artifactType === 'catalog') {
      category = !cls.resolved && sourceCatalogs.has(f.path) ? 'Quellkatalog' : 'Anwenderkatalog';
    }
    entries.push({
      path: f.path,
      artifactType: cls.artifactType,
      title: titleFromPath(f.path, cls.suffix),
      category,
      sha: f.sha,
      size: f.size,
    });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));

  return {
    generatedAt,
    source,
    ref,
    commit,
    license: 'CC-BY-SA-4.0',
    note:
      'Generated by tools/gen-library-index.mjs (ADR-0039). TALOS fetches every path from the live `ref` branch; ' +
      '`commit`/`sha` record the upstream state this index was generated from (drift check: npm run check:library), they do not pin content.',
    namespaces: findNamespacePaths(files),
    entries,
    ...(skipped.length > 0 ? { skipped } : {}),
  };
}

/** Percent-encode a repo path per segment (spaces and `+` occur in BSI paths). */
export function encodeRepoPath(path) {
  return path
    .replace(/^\/+/, '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/**
 * Every upstream URL TALOS depends on for a given index: each entry plus the namespace CSVs.
 * @param {{ entries: {path: string, title: string}[], namespaces: Record<string, string> }} index
 * @param {string} rawBase e.g. https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/
 */
export function libraryCheckTargets(index, rawBase) {
  const base = rawBase.endsWith('/') ? rawBase : rawBase + '/';
  return [
    ...index.entries.map((e) => ({ label: `${e.title} [${e.path}]`, path: e.path, url: base + encodeRepoPath(e.path) })),
    ...Object.entries(index.namespaces).map(([key, p]) => ({
      label: `namespace ${key} [${p}]`,
      path: p,
      url: base + encodeRepoPath(p),
    })),
  ];
}
