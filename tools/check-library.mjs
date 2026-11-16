#!/usr/bin/env node
/**
 * Upstream drift check for the BSI library integration (ADR-0039): verifies that every path in
 * src/data/library-index.json and both namespace CSVs still resolve on BSI's live `main`.
 *
 *   npm run check:library            # exit 1 if any URL does not return 200
 *   npm run check:library -- --json  # one JSON line per URL (for scheduled jobs / dashboards)
 *
 * Network-only maintenance check. Deliberately NOT part of `npm run check`, the harness or CI
 * gating: the test suite must never depend on the network (PLAT-002). Run it before a release, or
 * from a scheduled, non-blocking job; on failure regenerate the index (tools/gen-library-index.mjs).
 *
 * Decision IDs: ADR-0005, ADR-0039.
 */
import { readFileSync } from 'node:fs';
import { libraryCheckTargets } from './libraryLayout.mjs';

const RAW_BASE = 'https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/';
const index = JSON.parse(readFileSync(new URL('../src/data/library-index.json', import.meta.url), 'utf-8'));
const asJson = process.argv.includes('--json');
const color = process.stdout.isTTY && !asJson;
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);

async function probe(url) {
  const started = Date.now();
  try {
    // HEAD is enough for raw.githubusercontent.com; fall back to GET if a proxy refuses HEAD.
    let res = await fetch(url, { method: 'HEAD' });
    if (res.status === 405) res = await fetch(url);
    return { status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { status: 0, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  }
}

const targets = libraryCheckTargets(index, `${RAW_BASE}${index.ref}/`);
let failed = 0;
for (const t of targets) {
  const r = await probe(t.url);
  const ok = r.status === 200;
  if (!ok) failed++;
  if (asJson) {
    process.stdout.write(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: ok ? 'info' : 'error',
        event: 'bsi_library_check',
        component: 'check-library',
        decision_ids: ['ADR-0039', 'ADR-0005'],
        duration_ms: r.ms,
        path: t.path,
        url: t.url,
        status: r.status,
        ...(r.error ? { error: r.error } : {}),
      }) + '\n',
    );
  } else {
    process.stdout.write(`${ok ? paint(32, ' OK ') : paint(31, 'FAIL')} ${String(r.status).padStart(3)}  ${t.label}\n`);
  }
}

const summary = `${targets.length - failed}/${targets.length} upstream URLs resolve on ${index.ref} (index generated from ${String(index.commit).slice(0, 7)}).`;
if (asJson) {
  process.stdout.write(JSON.stringify({ event: 'bsi_library_check_summary', total: targets.length, failed }) + '\n');
} else if (failed > 0) {
  process.stdout.write(
    paint(31, `\n${summary}\n`) +
      'BSI has probably moved files upstream. Regenerate: node tools/gen-library-index.mjs > src/data/library-index.json\n',
  );
} else {
  process.stdout.write(paint(32, `\n${summary}\n`));
}
process.exit(failed > 0 ? 1 : 0);
