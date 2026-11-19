# TALOS Operations

Decision IDs: ADR-0002 (deploy), ADR-0005 (library), ADR-0001 (CI). TALOS is a static site —
"operations" means build/deploy, the library manifest, and client-side observability.

## Build & deploy
- **Dedicated `talos` GitHub repo**, GitHub Pages, Vite `base: '/talos/'`.
- GitHub Actions (`.github/workflows/deploy.yml`, T-024):
  `npm ci` → lint + typecheck → **full test suite (gate)** → `vite build` → deploy `/dist`
  via `actions/deploy-pages`.
- `404.html` = copy of `index.html` for non-hash path fallback `[ADR-0002]`.
- URL: `https://<user>.github.io/talos/`. License: **MIT** (code); BSI content CC-BY-SA-4.0.

## BSI library manifest `[ADR-0005, ADR-0039]`
- TALOS follows BSI's **live `main`** (PO Q1). `src/data/library-index.json` is bundled; it lists
  every library path plus the namespace CSV paths, with the upstream commit it was generated from.
- **Runbook — "library adopt / target-object picker / Risk Coverage shows HTTP 404":**
  1. `npm run check:library` — lists every indexed path/namespace URL with its HTTP status
     (`--json` for machine-readable lines with `decision_ids`).
  2. Regenerate: `node tools/gen-library-index.mjs > src/data/library-index.json` (GitHub Trees
     API; set `GITHUB_TOKEN` if rate-limited) or `--clone <path-to-clone>` from a fresh clone.
     Read the stderr warnings: unrecognised files in the OSCAL layers are listed, not indexed —
     extend `tools/libraryLayout.mjs` (+ TEST-LIB-04) if BSI introduced a new suffix.
  3. Refresh `tests/data/bsi/target_object_categories.csv` from the same commit and run
     `npm run check` (TEST-TOC-05 flags golden asset mappings that no longer exist upstream).
  4. Re-run `npm run check:library`, commit, deploy.
- Recommended: a scheduled, **non-blocking** job running `npm run check:library -- --json`
  (e.g. weekly); never wire it into the deploy gate — CI must not depend on GitHub availability.

## Runtime observability (client-side)
- Structured JSON-shaped logs via a logging util, each with `decision_ids`; in-app ring buffer
  for a diagnostics panel; warnings **yellow**, errors **red** `[ADR-0002]`.
- Config validated at startup; invalid config halts boot with a red error.
- **What to monitor post-deploy:** `BSI upstream resource could not be loaded` error records
  (context: `resource`, `url`, `status`) and `getUpstreamStats()` (`failures`, `notFound`,
  `servedFromCache`, `byResource`) — a rising `notFound` means BSI moved files; run the runbook.
- **OSCAL compliance (ADR-0040):** `getComplianceStats()` (`checks`, `compliant`, `nonCompliant`,
  `unchecked`, `totalMs`, `gateAllowed`, `gateBlocked`, `compliantExports`, `draftExports`) and the
  `ADR-0040` log records ("not compliant" with type + issue count + first pointer + duration;
  "Compliance gate: … refused"; "Exported … as a draft"). A rise in `nonCompliant` for
  *library-adopted* artifacts means BSI published schema-invalid content; a rise in `draftExports`
  means TALOS-authored output is not compliant often enough (an editor gap). A failed validator
  chunk load (offline right after a deploy) is retried on the next check.
- **Runbook — "new OSCAL release":** download the release's `oscal_{catalog,profile,component,ssp}_schema.json`
  into `schemas/oscal/<version>/`, write its `MANIFEST.json` (url, sha256, `$id`), bump
  `OSCAL_AUTHORING_VERSION` (ADR-0007), `npm run check` + harness (`schema-snapshot`).

## Failure modes & handling
| Failure | Handling |
|---|---|
| Library/namespace fetch fails / offline | Retry transient errors with backoff; serve cache with yellow warning; else red toast + `error` log `[ADR-0005, ADR-0039]` |
| BSI moved a file upstream (HTTP 404) | No retry; toast names resource + URL and says the index needs an update; follow the runbook above `[ADR-0039]` |
| IndexedDB quota exceeded | Warn + guide to export; never drop data `[ADR-0004]` |
| Invalid uploaded OSCAL | Unparseable / wrong type / non-1.x: reject with clear error, nothing stored `[ADR-0003, ADR-0007]`. Schema-invalid but parseable: stored, warning toast + badge, blocked as workflow input until fixed `[ADR-0040]` |
| External viewer unavailable | Show catalog data inline (minimal) + notice `[ADR-0008]` |
| Corrupt/incompatible stored record | Isolate record, surface error, allow export of the rest |

## Health metrics (final report, T-506)
Change-failure rate and MTTR tracked from CI + release history.

## Optional chaos experiments (T-507)
Build-step kill, network delay on library fetch, dependency failure — offered after completion.
