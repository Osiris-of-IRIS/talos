---
name: verify
description: Build/launch/drive recipe for manually verifying TALOS UI changes in a real browser.
---

TALOS is a static Vite+React SPA (HashRouter, IndexedDB persistence, no backend). There is no
existing Playwright *helper* script for ad-hoc manual driving (only the committed `tests/e2e/*`
suite, which is CI's job, not a verification tool) — this is the cold-start recipe that worked.

## Launch

```bash
npm run dev -- --port 4173   # backgrounded; ready in ~1s, serves http://localhost:4173/talos/
```

The `/talos/` base path (`vite.config.ts`) is required — `http://localhost:4173/` alone 404s.
Routes are hash-based: `http://localhost:4173/talos/#/component-definitions/new`, etc.

## Drive it

Use the `playwright` package already in `node_modules` (devDependency). Run any driver script
**from the repo root** — `import { chromium } from 'playwright'` only resolves there; running it
from another cwd (e.g. a scratchpad dir) fails with `ERR_MODULE_NOT_FOUND` even with `NODE_PATH`
set, because Node ESM resolution doesn't consult `NODE_PATH`. Write/copy the script into the repo
temporarily, run it, then delete it (`git status` should show it never landed).

Each `chromium.launch()` gets a fresh, empty IndexedDB — no seeding step needed, but every run
starts from zero workspace state (no catalogs/artifacts). To exercise anything that resolves
against a catalog (control-implementations' source/control-id/param pickers,
`<ControlDisplay>`), upload a small hand-built fixture catalog first via the `/catalogs` page's
file input:

```js
await page.goto(BASE + '#/catalogs');
await page.waitForSelector('[data-testid="catalog-upload-input"]', { state: 'attached' }); // input is `hidden`, never becomes visible
await page.setInputFiles('[data-testid="catalog-upload-input"]', path.resolve('my-catalog.json'));
```

A minimal catalog fixture (kebab-case OSCAL wire form — the app's `deepTransformKeys`/
`kebabToCamel` converts `how-many`→`howMany` etc. recursively on parse):

```json
{
  "catalog": {
    "uuid": "dddddddd-0000-4000-8000-000000000099",
    "metadata": { "title": "Verify Catalog", "last-modified": "2026-07-09T10:00:00Z", "version": "1.0.0", "oscal-version": "1.2.2" },
    "controls": [{
      "id": "VER.1", "title": "Verification Control",
      "params": [{ "id": "ver.1-prm1", "label": "Plain param" },
                 { "id": "ver.1-prm2", "label": "Criticality", "select": { "how-many": "one", "choice": ["low", "medium", "high"] } }],
      "parts": [{ "id": "VER.1_stm", "name": "statement", "prose": "...{{ insert: param, ver.1-prm1 }}..." }]
    }]
  }
}
```

### Filling `<datalist>`-backed pickers (source / control-id / param-id)

These fields (`ci-source`, `ir-control-id`, `sp-param-id`, etc., via the shared
`<DatalistInput>`) are native `<input list="...">` + `<datalist>` — Playwright has no
"pick a datalist option" primitive, and clicking doesn't open a real dropdown under Chromium
automation. Read the options and set the value directly instead. **Must use the native value
setter, not a bare `element.value = x`** — React's synthetic event system tracks the DOM value
via `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`, and setting the
property directly (bypassing that setter) means React's change-detection sees no diff, so
`onChange` never fires even after dispatching an `input` event:

```js
await page.evaluate(() => {
  const input = document.querySelector('[data-testid="ci-source"]');
  const list = document.getElementById(input.getAttribute('list'));
  const opt = list.querySelector('option'); // or .find(o => o.value === '...')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, opt.value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
```

### Gotchas

- `fullPage: true` screenshots duplicate the sticky sidebar (`<Sidebar>`, `position: sticky`,
  ADR-0029) at each stitched viewport segment — a visual artifact of the screenshot method, not
  a real bug. Prefer viewport screenshots (no `fullPage`) when the sidebar's duplication would
  be confusing, or just expect/ignore it.
- A newly-added component/control-implementation/requirement auto-expands (T-163/ADR-0028) so
  its fields are immediately clickable — no extra "expand" step needed after `add-*` buttons.
- MarkupEditor's preview toggle testid is `${dataTestId}-preview-toggle`; the textarea is
  `${dataTestId}-textarea` (e.g. `md-remarks-textarea`, `md-remarks-preview-toggle`).
