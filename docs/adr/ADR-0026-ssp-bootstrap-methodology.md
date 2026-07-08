# ADR-0026: SSP Bootstrap Assistant — Asset Model, Target-Object-Category Hierarchy & Generation Methodology

- **Status:** Approved
- **Date:** 2026-07-08
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0026 (references ADR-0003, ADR-0004, ADR-0005, ADR-0006, ADR-0012, ADR-0017, ADR-0023)

## Context

The `todo.md` "MVP Feedback" backlog specified the "bootstrap environment" assistant (mission
§B.2, feature `ASST-002`): upload an asset list, generate/update SSPs across the BSI
target-object-category hierarchy or, alternatively, one SSP per NIST-style "system" asset. The
ticket text bundled several open design questions (asset-list format, hierarchy source, baseline
type, "system" asset definition) and explicitly asked for clarifying questions before
implementation. This ADR records the resolutions (four supervisor decisions + implementation
choices) and the two generation algorithms.

## Decision

### 1. Baseline is catalog-only in this phase (Profiles remain deferred)
The ticket allowed "a catalog or profile" as the baseline; Profiles (`T-200`) don't exist yet and
were explicitly deferred by ADR-0017. This phase supports **catalog only** — the picker shows
workspace catalogs; a note explains profile support is pending `T-200`. No model or picker changes
are needed once profiles land; the assistant's catalog param generalizes to "catalog or profile."

### 2. Asset list is a three-file CSV trio, matching the golden data exactly
`asset_types.csv` (`uuid,title`), `assets.csv` (`uuid,name,asset_type,description,
security-sensitivity-level,information-types`), `mappings.csv` (`asset_type_uuid,
targetobj_class_uuid`) — the exact shape of `tests/data/golden/recplast`, so that golden dataset
works unmodified as the reference fixture. `mappings.csv` is folded into `AssetType
.targetObjectCategoryUuid` at parse time rather than kept as a third IndexedDB store, since the
relation is 1:1. A new RFC4180-ish parser (`src/data/csvParse.ts`) handles quoted fields, embedded
commas, and doubled-quote escaping — verified against the real BSI CSV's curly-quote (`" "`)
content, which turned out to need no escaping at all (the raw bytes are well-formed; an
LLM-mediated fetch of the same URL had silently "normalized" curly quotes to straight ones,
corrupting what looked like malformed CSV — a reminder to verify third-party content against raw
bytes, not summarized renderings, when correctness depends on exact characters).

Assets/asset-types are **not** OSCAL artifacts — they are TALOS-internal input data that drives
generation, never themselves imported/exported as OSCAL — so they get bespoke `assets` /
`assetTypes` IndexedDB stores (`db.ts`, `DB_VERSION` 3) and a bespoke Zustand store
(`src/features/assets/store.ts`), not `createArtifactStore`/`ArtifactRepository`. A CSV-trio
upload **replaces** the whole list (re-upload = re-sync), matching "the asset list" as one unit of
data. Cross-referencing problems (an asset naming an unknown `asset_type`) are non-blocking
warnings, not upload failures (draft-friendly convention).

### 3. Target-object-category hierarchy is live-fetched (like the BSI library, ADR-0005)
Sourced from `Dokumentation/namespaces/target_object_categories.csv` in the BSI repo (a small,
~40-row CSV: `Zielobjekt,Definition,Typ,Kategorie,Synonyme,ChildOfUUID,UUID`). The supervisor chose
live-fetch over a bundled generated snapshot, for the same reason as the library (ADR-0005):
always current, at the cost of a second live external dependency. `src/data/
targetObjectCategoryLoader.ts` mirrors `libraryLoader.ts`'s pattern (injectable fetcher, timeout +
retry/backoff, IndexedDB cache, offline fallback to a stale cached copy with a warning) — but
unlike the library, there is no manifest/sha to pin freshness against, so every load attempts a
fresh fetch and only falls back to cache on failure.

### 4. Controls tag themselves with a category **title**, on the control or a nested part
Verified against the live BSI Kernel catalog: a control (usually its `statement` part, sometimes
the control itself) carries `props: [{name: "target_object_categories", value: "<German
Zielobjekt title>"}]` — a title string, not the category's uuid. `src/data/
targetObjectHierarchy.ts` provides `controlTargetCategories` (own props + recursive part props,
not descending into nested sub-controls), `ancestorChain`/`categoryTitlesInChain` (walk
`ChildOfUUID` to the root, self included), `controlMatchesCategoryOrAncestor`, and
`hasNoTargetObjectCategory` (the BSI-style ISMS-scope rule). The ancestor-chain example from the
ticket text (an asset mapped to "Webanwendungen" also pulls in controls tagged "Webserver" or
"Anwendungen") was verified against the live hierarchy: `Webanwendungen` → `ChildOfUUID` →
`Webserver` → `ChildOfUUID` → `Anwendungen`.

### 5. NIST-style "system" asset = mapped category's `Typ === "IT-Systeme"`
The ticket's "for each asset of type 'system' or 'IT-System'" doesn't match any literal
`asset_type` value in the golden data (`client-pc`, `server`, `application-web`, …); the BSI
hierarchy's own `Typ` column does classify categories as `IT-Systeme` (`Endgeräte`, `Hostsysteme`,
`Mobiltelefone`, …). The supervisor confirmed this interpretation. NIST-style otherwise ignores
target-object-categories entirely: each qualifying asset's SSP gets **every** control in the
chosen catalog as its `control-implementation` (no category filtering) — that's the NIST/BSI
distinction the ticket draws.

### 6. Generation algorithms (`src/features/bootstrap/{generateNist,generateBsi}.ts`)
Both are pure functions returning `{ plans: BootstrapSspPlan[]; warnings: string[] }` — no
IndexedDB access, fully unit-testable against fixture data:
- **NIST-style:** one plan per "system"-typed asset (rule 5); `control-implementation` = every
  control in the catalog.
- **BSI-style:** always one ISMS-wide plan (`hasNoTargetObjectCategory` controls — "all controls
  without any target object category are inserted into this SSP", per the ticket, evaluated over
  every control in the catalog including group-only container controls); plus one plan per asset
  with a resolvable category, filtered to controls matching that category or an ancestor.
- An asset whose type is unknown, or whose mapped category isn't in the loaded hierarchy, is
  **skipped with a warning**, not a hard failure — draft-friendly, matches the rest of the app.

Neither generator touches `system-implementation` (components/by-components) — that stays a manual
follow-up step in the existing SSP editor (T-111/ADR-0023), out of this ticket's scope.

### 7. Idempotent re-run via a `bootstrap-source` provenance prop
The ticket's title ("creating **or updating** the list of SSPs") requires re-running the assistant
to update, not duplicate, previously-generated SSPs. Each plan carries a `correlationKey`
(`asset:<uuid>`, or the `isms` sentinel) written as a `bootstrap-source` prop on
`system-characteristics.props` — the same plain kebab-case `props[]` provenance convention as
component-import (ADR-0023). `applyBootstrapPlans` (`src/features/bootstrap/applyPlans.ts`) looks
up an existing SSP by that correlation key: if found, it overwrites only `system-characteristics`
and `control-implementation`, preserving everything an analyst added by hand afterward
(`system-implementation`, back-matter, metadata); otherwise it creates a new SSP from
`createBlankSsp()`.

### 8. Prerequisite gating on the landing page
The ticket requires the assistant be "greyed out" with a hover explanation until an asset list is
uploaded. `LandingPage`'s `FeatureCard` gained an optional `disabled`/`disabledTitleKey` — a
disabled card renders as inert text with a `title` tooltip instead of a link. A new "Assistants"
landing-page layer group holds the bootstrap card (mission §B lists assistants as a category
distinct from the OSCAL layers); "Assets" joins the Data layer next to the BSI Library.

## Consequences

**Positive:** the generation algorithms are pure and independently tested against real BSI
hierarchy data (verified via a direct `curl` of the raw CSV, not a summarized fetch); re-running
the assistant is safe and non-destructive to manual edits; assets are cleanly separated from OSCAL
artifacts, avoiding any temptation to misuse `inventory-items` for input data that was never meant
to round-trip as OSCAL.
**Negative:** the assistant depends on a second live external fetch (the namespace CSV) alongside
the library (ADR-0005) — both degrade to cached/offline data, but a first-run with no network and
no cache blocks generation entirely; ISMS-wide BSI generation sweeps in every untagged control,
including any group-only "container" controls a catalog might use structurally (matches the
ticket's literal wording, may need revisiting once more real catalogs are exercised); the ISMS
SSP's `system-characteristics.system-name` defaults to the literal string `"ISMS"` (user-editable
content, not translated, per the existing "seed values aren't translated" convention) rather than
a supervisor-chosen name.

## References
- ADR-0003 (OSCAL model), ADR-0004 (IndexedDB stores), ADR-0005 (live-fetch + offline-fallback
  pattern reused here), ADR-0006 (landing page / assistants), ADR-0012 (i18n — UI copy vs.
  untranslated document content), ADR-0017 (profiles deferred), ADR-0023 (props-based provenance
  convention). Implementation: `src/data/{csvParse,targetObjectCategoryLoader,
  targetObjectHierarchy}.ts`, `src/models/{asset,targetObjectCategory}.ts`, `src/features/assets/`,
  `src/features/bootstrap/`. Tests: `tests/data/{csvParse,targetObjectCategoryLoader,
  targetObjectHierarchy}.test.ts`, `tests/models/{asset,targetObjectCategory}.test.ts`,
  `tests/features/{assetsStore,assetsListPage,bootstrapGenerate,bootstrapApplyPlans,
  bootstrapAssistantPage}.test.ts(x)`, `tests/app/landingPage.test.tsx`
  (TEST-ASST-02, `feature_registry.yaml` `ASST-002`).
