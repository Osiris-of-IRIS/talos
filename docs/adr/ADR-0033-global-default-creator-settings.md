# ADR-0033: Global Default Creator Identity & Settings Page

- **Status:** Approved
- **Date:** 2026-07-11
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0033 (references ADR-0004, ADR-0012, ADR-0019, ADR-0026)

## Context

ADR-0019 made a `creator` responsible-party (name + email) mandatory on every OSCAL artifact,
enforced at export. Authoring only ever seeded the `creator` **role** (`blank.ts`, every artifact
type) — the user has always had to manually add a party and assign it via `<MetadataEditor>` on
*every single document*. With component-definitions, SSPs, and profiles all in active use (plus
three SSP-bootstrap generation variants that mint SSPs in bulk), re-typing the same name and email
per document is exactly the kind of repetitive, tedious step the supervisor flagged: "picking out
name, e-mail and then applying that becomes tedious for multiple OSCAL artifacts."

## Decision

### 1. A global, persisted default creator — name, email, optional uuid

A new `/settings` page lets the user enter their name, email, and (optionally) a party uuid once.
Persisted as three new optional fields on the existing single-row `settings` IndexedDB store
(`TalosSettings.creatorName`/`creatorEmail`/`creatorUuid`, `src/data/db.ts`) — the same store
language/theme already live in (ADR-0012), no `DB_VERSION` bump needed (new optional fields on an
existing keyPath'd store, not a structural change).

### 2. Stable identity: the uuid is picked once and reused, never re-minted per document

The supervisor's phrasing — "optionally a uuid for the party, else it's picked automatically" — is
ambiguous between "a fresh uuid per document" and "one stable uuid reused everywhere." A fresh
uuid per document would defeat the entire point of a global creator: the same real-world person
would show up as a *different* OSCAL party in every document, with no way to recognize them as the
same entity across artifacts. Decided: **stable**. The Settings page (`SettingsPage.tsx`), on the
first save with a name and email but no uuid, mints one (`crypto.randomUUID()`) and immediately
persists + displays it back — every subsequent document then reads that same
`settings.creatorUuid`. A later save never re-mints one as long as the field is already populated
(user-editable if they want to change it).

### 3. Auto-seeding is additive to ADR-0019, not a replacement

`blank.ts` factories are unchanged — they still only seed the `creator` **role** (not a party).
A new pure function, `applyDefaultCreator` (`src/data/defaultCreator.ts`), does the rest: given a
freshly-created artifact and the current settings, it appends a `person`-type party (name, email)
to `metadata.parties` and assigns it to the `creator` role in `metadata.responsibleParties` — but
**only** when both a name and an email are configured (same bar `validateCreator` already checks),
and **only** when the artifact doesn't already have a creator assigned (defensive; never
overwrites). When nothing is configured, behavior is byte-for-byte what it was before this ADR:
the user fills in the party by hand, guided by `<MetadataEditor>`'s existing non-blocking
`md-creator-status` banner.

### 4. Applied at every creation path, not retroactively

Six creation paths construct a blank artifact; all six now apply the default creator:

- `ProfileEditorPage`, `SspEditorPage`, `ComponentDefinitionEditorPage` — each already had a
  `useState<T | null>(isNew ? createBlankX() : null)` + a `uuid`-gated load effect for the edit
  case. A new shared hook, `useSeedDefaultCreator` (`src/features/shared/useSeedDefaultCreator.ts`),
  adds a sibling effect: on mount, for `isNew` only, load settings and patch the draft via
  `applyDefaultCreator`. A no-op for the edit-existing-document path.
- `ProfileCreationAssistantPage` — draft state is always non-null (no edit mode), so it gets an
  inline equivalent effect rather than forcing the nullable-state hook's shape onto it.
- `applyPlans.ts` (all three SSP-bootstrap variants — NIST-style, BSI-style, Single-System,
  ADR-0026 §9 — funnel through the same `applyOnePlan`): settings are loaded once in
  `applyBootstrapPlans` and applied only on the **create** branch. The **update** branch (a
  re-run against an already-correlated SSP) is untouched — it must not resurrect a default creator
  an analyst deliberately removed or changed by hand after the SSP was first generated.

Existing already-created documents are **never** retroactively updated when the global setting
changes or is set for the first time — this only ever affects documents created *after*
configuration, matching the supervisor's own phrasing ("applied to all **newly created**
documents").

### 5. Person, not organization; no format validation beyond non-empty

The settings form asks only for name + email (+ optional uuid) — matching the user's literal
request, not a full party editor. `applyDefaultCreator` always seeds `type: 'person'`. No email
format validation is added (the rest of the app, including `validateCreator` itself, only checks
non-empty — consistent, not gold-plated); if an organization-level default creator is ever needed,
that's a follow-up ticket, not a silent scope-creep here.

## Alternatives considered

- **Fresh uuid per document:** rejected — see §2; breaks cross-document identity, the entire
  point of the feature.
- **Retroactively backfilling existing documents when settings are (re)configured:** rejected —
  out of the stated scope, and a much larger blast radius (silently rewriting already-authored
  metadata) than a supervisor casually setting up their name/email would expect.
- **Seeding the party directly in `blank.ts`:** rejected — `blank.ts` factories are synchronous,
  pure, and have no IndexedDB access (by design, per every existing factory's doc comment); making
  them async to read settings would ripple into every call site and every existing test that
  constructs a blank artifact directly. Keeping `blank.ts` unchanged and applying the default
  creator as a separate, explicit step at each *page's* mount (or bootstrap's apply step) keeps the
  factories pure and the new behavior isolated to exactly the places it's needed.

## Consequences

**Positive:** the single most-repeated manual step across every artifact-creation flow (name +
email entry) is now a one-time setup; the stable-uuid design means TALOS-authored documents
consistently identify the same person/org across the whole workspace, which is also generally
better OSCAL practice than a fresh anonymous party per document. No change to `blank.ts` or its
existing tests; the non-blocking editor / blocking-at-export enforcement from ADR-0019 is
completely unchanged for anyone who never opens the Settings page.

**Negative:** the Settings page's uuid field accepts free text with no format validation (matches
the rest of the app's current scope-boundary — full per-type OSCAL JSON-Schema validation,
including uuid format, is still T-030/deferred); a malformed manually-entered uuid would only
surface at export time via whatever validation T-030 eventually adds, not before. The topbar
`⚙️` link exists outside `navigation.ts`'s sidebar/landing-page feature groups (it's a global
preference, not an OSCAL-layer feature, matching `<ThemeToggle>`/`<LanguageSwitcher>`'s existing
placement) — discoverable from every page, but not listed on the landing page's card grid.

## References

- ADR-0004 (IndexedDB `settings` store), ADR-0012 (i18n, the existing `settings`-store precedent
  for language/theme), ADR-0019 (mandatory creator identity — this ADR automates its manual-entry
  half), ADR-0026 §9 (Single-System bootstrap variant — one of the three generators this seeds).
- Implementation: `src/data/db.ts` (`TalosSettings` extension), `src/data/defaultCreator.ts`,
  `src/features/shared/useSeedDefaultCreator.ts`, `src/features/settings/SettingsPage.tsx`,
  `src/app/SettingsLink.tsx`, `src/app/App.tsx` (`/settings` route + topbar link);
  wired into `src/features/{profiles/ProfileEditorPage,profiles/ProfileCreationAssistantPage,
  ssps/SspEditorPage,componentDefinitions/ComponentDefinitionEditorPage}.tsx` and
  `src/features/bootstrap/applyPlans.ts`.
- Tests: `tests/data/defaultCreator.test.ts`, `tests/features/settingsPage.test.tsx`; creator-seed
  cases added to `tests/features/{profileEditor,sspEditor,componentDefinitionEditor,
  profileCreationAssistant,bootstrapApplyPlans}.test.ts(x)` (TEST-SETTINGS-01, TEST-SETTINGS-02,
  `feature_registry.yaml` `PLAT-006`).
