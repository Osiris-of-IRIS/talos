#!/usr/bin/env node
/**
 * Regenerate src/data/library-index.json from the BSI Stand-der-Technik-Bibliothek
 * (ADR-0039, ADR-0005). Maintenance tool — NOT part of CI or the test suite (needs network or a
 * local clone). Layout knowledge lives in tools/libraryLayout.mjs (unit-tested, TEST-LIB-04).
 *
 * Two sources, same output:
 *
 *   # from a local clone (exact git blob shas/sizes via `git ls-tree`, profiles read from disk)
 *   node tools/gen-library-index.mjs --clone ../Stand-der-Technik-Bibliothek > src/data/library-index.json
 *
 *   # from GitHub (Git Trees API, one request; profiles fetched from raw.githubusercontent.com).
 *   # Unauthenticated limit is 60 req/h; pass GITHUB_TOKEN to raise it.
 *   node tools/gen-library-index.mjs > src/data/library-index.json
 *
 * Files in the OSCAL layer folders whose suffix is not recognised are reported on stderr and
 * listed under `skipped` (never silently dropped). Then run `npm run check:library` to confirm
 * every indexed path and namespace CSV resolves on live `main`.
 *
 * Decision IDs: ADR-0005, ADR-0039.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildLibraryIndex, classifyLibraryFile, encodeRepoPath } from './libraryLayout.mjs';

const OWNER = 'BSI-Bund';
const REPO = 'Stand-der-Technik-Bibliothek';
const REF = 'main';
const SOURCE = `https://github.com/${OWNER}/${REPO}`;
const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${REF}/`;
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

function git(dir, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
}

function fromClone(dir) {
  const root = resolve(dir);
  const commit = git(root, 'rev-parse', 'HEAD').trim();
  // "<mode> blob <sha> <size>\t<path>" — `-z` keeps paths with spaces/non-ASCII verbatim.
  const files = git(root, 'ls-tree', '-r', '-l', '-z', 'HEAD')
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split('\t');
      const [, type, sha, size] = meta.trim().split(/\s+/);
      return type === 'blob' ? { path, sha, size: Number(size) } : null;
    })
    .filter(Boolean);
  const profiles = new Map(
    files
      .filter((f) => classifyLibraryFile(f.path)?.artifactType === 'profile')
      .map((f) => [f.path, JSON.parse(readFileSync(join(root, f.path), 'utf-8'))]),
  );
  return { files, profiles, commit };
}

async function ghJson(url) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}`);
  return res.json();
}

async function fromGitHub() {
  const commit = (await ghJson(`${API}/commits/${REF}`)).sha;
  const tree = await ghJson(`${API}/git/trees/${commit}?recursive=1`);
  if (tree.truncated) throw new Error('GitHub tree listing truncated — use --clone instead.');
  const files = tree.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, sha: e.sha, size: e.size }));
  const profiles = new Map();
  for (const f of files) {
    if (classifyLibraryFile(f.path)?.artifactType !== 'profile') continue;
    const res = await fetch(RAW.replace(`/${REF}/`, `/${commit}/`) + encodeRepoPath(f.path));
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching profile ${f.path}`);
    profiles.set(f.path, await res.json());
  }
  return { files, profiles, commit };
}

const cloneIdx = process.argv.indexOf('--clone');
const { files, profiles, commit } =
  cloneIdx >= 0 ? fromClone(process.argv[cloneIdx + 1] ?? '.') : await fromGitHub();

const index = buildLibraryIndex({
  files,
  profiles,
  source: SOURCE,
  ref: REF,
  commit,
  generatedAt: new Date().toISOString(),
});
for (const p of index.skipped ?? []) {
  process.stderr.write(`\x1b[33mwarning: unrecognised OSCAL-layer file, not indexed: ${p}\x1b[0m\n`);
}
process.stderr.write(
  `indexed ${index.entries.length} artifacts @ ${commit.slice(0, 7)}; namespaces: ${Object.values(index.namespaces).join(', ')}\n`,
);
process.stdout.write(JSON.stringify(index, null, 2) + '\n');
