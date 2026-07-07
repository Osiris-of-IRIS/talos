# TALOS Conventions

Engineering conventions for TALOS. Decision IDs referenced inline.

## Language & structure
- **TypeScript strict**; React 18 function components + hooks.
- Directory layout: `src/app` (shell/router/landing), `src/features/<feature>`, `src/shared`,
  `src/models`, `src/data`, `src/stores`, `src/locales`, `public`.
- One artifact type = one feature folder; each reuses the shared metadata/back-matter editors
  and its own body editor + codec `[ADR-0003]`.

## Naming
- Files: components `PascalCase.tsx`; modules/utilities `camelCase.ts`; tests `*.test.ts(x)`.
- OSCAL models mirror spec names in `PascalCase` interfaces; JSON keys use OSCAL's kebab-case
  handled only in codecs, not in the app model.
- CSS: BEM-ish page classes; tokens per the three-tier architecture `[ADR-0010]`.

## OSCAL handling
- Never render OSCAL markup by hand — always the shared renderer `[ADR-0009]`.
- For *displaying* markup-line/markup-multiline content (not editing), use `<MarkupView>`
  (`src/shared/MarkupView.tsx`), not `<Markup>` directly — it truncates long content to a
  consistent size and offers a modal expand. `<ControlDisplay>`'s own statement/param
  truncation is the one exception `[ADR-0022, ADR-0016]`.
- Author/export **v1.2.2**; import any 1.x with a warning `[ADR-0007]`.
- Preserve unknown-but-allowed fields; keep unresolved refs verbatim `[ADR-0003, ADR-0014]`.
- All entity pickers use the shared entity-search `[ADR-0013]`.

## UI
- Colors/tokens per `[ADR-0010]`; symbols per `[ADR-0011]` (interactive symbols need
  `aria-label` + `title`). Theme via `data-theme`, never `@media (prefers-color-scheme)`.
- All user-facing strings via `t('key')` `[ADR-0012]`; no hard-coded copy. Default language `de`.
  Add a key to **both** `src/locales/en.json` and `src/locales/de.json` (parity is enforced by
  `TEST-I18N-01`). Isolated component tests render without an `<I18nProvider>` on purpose — the
  `useI18n()` context default resolves against English, so keep the English catalog value
  identical to what a test asserts if the test predates translation.
  Default seed values written into new artifacts (e.g. a blank component's title, the seeded
  `Creator` role title) are **not** translated — they're user-editable document content, not UI
  chrome.

## State & data
- Views read/write via Zustand stores; stores persist through repositories; **never** touch
  IndexedDB from a component `[ADR-0004]`.
- Draft-friendly editing: validation is non-blocking; enforced at export.

## Logging & errors
- Use the logging util; every record includes `decision_ids`. Warnings **yellow**, errors
  **red** in console + toasts `[ADR-0002]`.
- Fail fast on invalid config at startup with a clear red error.

## Git & commits
- Dedicated `talos` repo. Conventional-commit style (`feat:`, `fix:`, `docs:`, `test:`).
- Tests + lint + typecheck must pass locally before push (CI re-checks and gates deploy).
- Reference ticket IDs (`T-###`) and ADR IDs in commit bodies where relevant.

## Testing
- TDD: test (+ golden data) before/with code `[ADR-0001]`. New scenario → add test first.
- Golden OSCAL fixtures in `tests/data/`; BSI-derived fixtures carry CC-BY-SA attribution.
- **Every major feature ships a Playwright E2E** in `tests/e2e/<feature>.spec.ts` driving its
  primary flow, using stable `data-testid`/ARIA selectors and clearing IndexedDB per test. See
  the E2E convention in `docs/testing.md` and the reference `tests/e2e/componentDefinitions.spec.ts`.
  UI components must expose `data-testid` hooks for their key elements.
