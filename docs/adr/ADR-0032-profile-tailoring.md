# ADR-0032: OSCAL Profile CRUD, Tailoring Model & the Profile Creation Assistant

- **Status:** Approved
- **Date:** 2026-07-10
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0032 (references ADR-0003, ADR-0004, ADR-0009, ADR-0010, ADR-0013,
  ADR-0014, ADR-0016, ADR-0017, ADR-0021, ADR-0026)

## Context

ADR-0017 explicitly deferred the Profile feature ("Profiles become a distinct later phase; their
absence is explicit, not accidental") so control-implementation/import-profile pickers could ship
without boiling the ocean. `todo.md`'s "MVP Feedback" section now asks for that phase: full CRUD
over OSCAL profiles (T-200/201/202) plus a guided **Profile Creation Assistant** that builds a
profile from one or more existing catalogs/profiles via three inclusion strategies, one of them a
novel visual **target-object picker** reusing the BSI target-object-category hierarchy ADR-0026
already wired up for asset-to-SSP bootstrap matching.

The MVP ticket's target-object picker asked for colors "from `./resources/target_object_hierarchy.png`"
— that file didn't exist in the repo when work started; the supervisor supplied it mid-session.
Pixel-sampling it (not eyeballing) gave 7 exact root hex values, one per top-level category, with
child/leaf nodes rendered as the **same hue at increasing lightness** — not 41 independently chosen
colors. That distinction matters: the hierarchy itself is live-fetched CSV data (ADR-0026), so a
hardcoded per-node color table would drift out of sync the moment BSI adds a category; a
depth-indexed lightness ramp derived from 7 root constants never can.

## Decision

### 1. Profile model scope — fully typed for round-trip, editor covers the MVP subset

`src/models/profile.ts` types the whole NIST OSCAL v1.2.2 profile shape (fetched directly from
the metaschema outline, not inferred) so upload→edit→export is **lossless** even for parts the
editor doesn't expose yet — same convention as `ComponentDefinition.components[].protocols`
(ADR-0003): unbuilt fields stay typed as `unknown`/passthrough rather than being silently dropped
by the envelope codec (which is fully generic key-casing, so it never depends on a field being
"known" to round-trip it).

**Editable this phase:** `imports[].href` (+ `include-all` / `include-controls.with-ids` /
`exclude-controls.with-ids`), `modify.set-parameters`. **Fixed, not exposed:** `merge = { as-is:
true }` — the ticket's own v1 scope line ("keep the merge-strategy as-is always... earmark for a
possible later expansion"); every profile TALOS creates gets this merge block, and an uploaded
profile that already carries a different `merge` keeps it on round-trip (edited profiles are not
silently rewritten). **Typed but not editable (deferred, round-trip-safe):** `include-controls[].matching`
(pattern-based selection — the ticket's inclusion modes are all/by-id/target-object, not regex),
`merge.flat`/`merge.custom`, `modify.alters` (add/remove control elements).

### 2. Reference-picking — source is a workspace catalog *or* profile, back-matter-mediated

`imports[].href` resolves exactly like `control-implementation.source` (T-142) and
`import-component-definitions` (T-102/ADR-0014): a back-matter resource identifies the source via
`document-id` → resource uuid → title fallback, via the existing generic `ensureArtifactResource`
(no new resolution mechanism). The picker is `<EntitySearchField>` (ADR-0013) filtered to
`['catalog', 'profile']` — profile-importing-a-profile is spec-legal (chained tailoring) and
costs nothing extra since the entity-search core is already artifact-type-agnostic. This is the
reference-picking gap ADR-0017 named explicitly ("SSP `import-profile` stays manual... until the
Profile feature lands") — landing it here also unblocks that SSP picker and `control-implementation.source
→ profile`, tracked as follow-up tickets, not done in this ADR's scope.

### 3. By-id inclusion picker reuses `<ControlDisplay>`, source-scoped

`include-controls`/`exclude-controls` `with-ids` are picked from the resolved source's own control
list (source-scoped resolution, the same convention `control-id` pickers already use, ADR-0021),
rendered via the existing `<ControlDisplay>` helper with a checkbox per row, filterable by id,
alt-identifier, title, or statement prose (`controlDisplay.ts` already has the label/alt-id
resolution this needs — no new matching helper).

### 4. Target-object picker — exact colors, and an inclusion algorithm read literally from the ticket

**Colors:** 7 root hex values pixel-sampled from the supplied reference image (below), each
category's full subtree rendered as that hue at a lightness that increases with tree depth (an
HSL ramp derived from the root color, capped at the hierarchy's 4 levels) rather than a
per-node color table — the image's own visual pattern, and the only approach that survives the
hierarchy's live-fetched, occasionally-changing CSV source.

| Root category | Hex |
|---|---|
| Standorte | `#29A58D` |
| Nutzende | `#E48734` |
| Netze | `#9552B1` |
| IT-Systeme | `#2E9F92` |
| Informationen | `#EE9616` |
| Einkäufe | `#A74A7C` |
| Anwendungen | `#3F8EAF` |

**Selection & inclusion semantics** (the ticket's wording, made precise): clicking a node adds it
to an explicit selection set; every selection's full ancestor chain (via `parentUuid`, same walk
as `ancestorChain` in `targetObjectHierarchy.ts`) is rendered with the lighter "included via
descendant" border, and **also counts toward control inclusion** — the ticket's "the resulting
profile will include all controls that have one of the included target objects" refers to the
*rendered-included* set (selection ∪ ancestors), not the explicit-click set alone. Concretely:
`eligibleTitles = ⋃ categoryTitlesInChain(selectedUuid, byUuid)` over every selected node, and a
control is included iff `controlMatchesAnyTitle(control, eligibleTitles)` — **both functions
already exist**, built for ADR-0026's asset→SSP category matching and origin-agnostic by
construction; the picker is a second, UI-driven caller of the same matching core, not a
reimplementation. Deselecting a node removes it from the explicit set and recomputes the
ancestor/eligible union from what's left (so a shared ancestor stays included while any sibling
selection keeps it alive, per the ticket).

**"Produktspezifikation" filter:** verified against the live BSI catalog (fetched
`Grundschutz++-catalog.json` directly, not assumed) — a control's tag list is a **single**
`props[name="tags"]` entry holding a comma-separated string (e.g. `"Compliance Management, ..."`),
not one prop per tag. The checkbox, when checked, additionally requires `"Produktspezifikation"`
(trimmed, exact match) in that split list.

**Live counter:** derived from the same `eligibleTitles` computation against the resolved source's
full control tree (including nested `control.controls`, per the ticket) — no separate count path
to drift out of sync with what actually gets included.

### 5. `imports[].href` control-checklist only resolves controls when the source is a catalog

A profile's import source is either a catalog (direct `controls`) or another profile
(§2) — but *that* profile's own effective control set depends on resolving **its** `imports`
through **its** `merge`/`modify`, recursively. No ticket asks for that recursive resolution yet,
and building it as a side-effect of the by-id checklist would be exactly the kind of unscoped
expansion ADR-0017 was written to avoid. So: the `<ControlSelectionChecklist>` (with-ids picker,
reused by both the editor's by-id/exclude mode and the Assistant's step 3b) only renders when the
resolved source is a **catalog**; a profile-sourced import keeps `include-controls`/
`exclude-controls` editable as a plain comma-separated control-id list (same "raw-text row"
convention `ControlImplementationsEditor`'s set-parameters already uses for values that resist a
structured picker). `include-all` is unaffected either way — it needs no control list. Recursive
profile-of-profile control resolution is tracked as a follow-up ticket, not silently degraded.

### 6. Merge strategy is fixed at `as-is` for v1

Per the ticket, no UI for `flat`/`custom` merge; earmarked as a future ticket if a real need
surfaces (custom group reordering has no requester yet).

## Alternatives considered

- **Hardcode a color per target-object-category uuid (41 entries):** most literally matches "use
  the colors from the image," but silently goes stale the moment BSI's live CSV (ADR-0026) adds or
  renumbers a category — the hierarchy is fetched, not vendored. Rejected in favor of the 7-root +
  depth-ramp derivation, verified against the image at three depths (root/mid/leaf teal samples)
  before committing to the ramp approach.
- **Treat "included" (for control-matching) as only the explicitly-clicked set, using the ancestor
  border purely as a breadcrumb:** simpler, but contradicts the ticket's own sentence connecting
  "included target objects" (the ancestor-inclusive rendering) directly to what controls end up in
  the profile. Rejected — the literal reading is also the one with an existing, tested matching
  function (`controlMatchesAnyTitle`/`categoryTitlesInChain`) built for exactly this shape of
  problem.
- **Model `modify.alters` and `merge.custom` fully now:** more spec-complete, but no ticket asks
  for control-element surgery or custom grouping yet, and modeling them as `unknown` already
  guarantees lossless round-trip for any uploaded profile that uses them. Deferred.

## Consequences

**Positive:** profile CRUD lands on the same generic rails every other artifact type uses (envelope
codec, `createArtifactStore`, `ArtifactRepository`, `<EntitySearchField>`, `<ControlDisplay>`) —
no new abstraction tier. The target-object picker's matching core is fully reused from ADR-0026,
tested there already. Colors survive hierarchy drift because they're keyed to 7 stable root
categories, not the live-fetched node list.

**Negative:** `include-controls[].matching` (regex-pattern selection) and `modify.alters` are
typed-but-inert — a profile round-tripped through TALOS that relies on either keeps working, but
can't be *authored* here yet; a future ticket if BSI/NIST source profiles are found using them in
practice. The depth-ramp coloring is an approximation of the reference image, not a pixel-exact
reproduction of all 41 nodes — accepted given the alternative breaks under a live data source.

## References
- ADR-0003 (model conventions), ADR-0004 (persistence), ADR-0009 (markup rendering, prose search
  in the by-id picker), ADR-0010 (color token tiering, applied to the target-object palette),
  ADR-0013 (entity-search picker), ADR-0014/T-102 (back-matter-mediated compose, reused for
  `imports[].href`), ADR-0016 (`<ControlDisplay>`), ADR-0017 (the original profile deferral this
  ADR closes), ADR-0021 (control-id resolution), ADR-0026 (target-object-category hierarchy +
  matching helpers, reused verbatim).
- NIST OSCAL v1.2.2 profile json-outline (fetched directly).
- BSI `Grundschutz++-catalog.json` (fetched live to verify the `tags` prop shape).
- Implementation: `src/models/profile.ts`, `src/models/controlTags.ts`,
  `src/data/profileImportResolution.ts`, `src/features/profiles/` (`store.ts`, `blank.ts`,
  `ProfilesListPage.tsx`, `ProfileDetailPage.tsx`, `ProfileEditorPage.tsx`,
  `ControlSelectionChecklist.tsx`, `TargetObjectPicker.tsx`, `targetObjectColors.ts`,
  `ProfileCreationAssistantPage.tsx`).
- Tests: `tests/models/profile.test.ts`, `tests/features/profiles*.test.tsx`,
  `tests/app/targetObjectColors.test.ts`, `tests/features/profileCreationAssistant.test.tsx`.
