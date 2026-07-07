# TALOS

**T**rust **a**nd **A**ssessment **L**ifecycle for **O**rganizational **S**ecurity.

A static, client-side web app (React + Vite + TypeScript, hosted on GitHub Pages) for the
information and cybersecurity compliance workflow based on [OSCAL](https://pages.nist.gov/OSCAL/)
artifacts. All data stays in the browser (IndexedDB) — no backend.

See [`mission-statement.txt`](mission-statement.txt) for the full feature set, and
[`docs/technical_design.md`](docs/technical_design.md) / [`docs/adr_registry.md`](docs/adr_registry.md)
for architecture and decisions.

## Quick Start

Requires Node.js >= 20.

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build static assets to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run test` | Unit/component tests (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run test:harness` | Traceability & golden-data gate (`tests/test_harness/runner.py`, requires `pip install -r tests/test_harness/requirements.txt`) |
| `npm run check` | lint + typecheck + test |

## Project status

Implementation status is tracked per-feature in [`docs/feature_registry.yaml`](docs/feature_registry.yaml)
and per-test in [`tests/tests.yaml`](tests/tests.yaml). See [`todo.md`](todo.md) for the current backlog.
