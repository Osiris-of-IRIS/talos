# ADR-0031: Asset Inventory Data Structure — OSCAL Alignment & Inventory-Item Generation

- **Status:** Approved
- **Date:** 2026-07-09
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0031 (references ADR-0003, ADR-0004, ADR-0007, ADR-0017, ADR-0023, ADR-0026, ADR-0027)

## Context

The `todo.md` "MVP Feedback" entry asked for the asset inventory (ADR-0026's three-file CSV trio:
`asset_types.csv`/`assets.csv`/`mappings.csv`) to become **OSCAL-compatible**, supporting the
fields of the NIST OSCAL v1.2.2 `system-implementation/inventory-items` model, and for bootstrap
generation to actually populate `inventory-items` from it.

This directly revisits a stance ADR-0026 took deliberately: its Consequences section calls out
"assets are cleanly separated from OSCAL artifacts, avoiding any temptation to misuse
`inventory-items` for input data that was never meant to round-trip as OSCAL" — at the time,
`SystemImplementation.inventoryItems` was left as an untyped `unknown[]` placeholder, unused. This
ADR is the supervisor's explicit decision to now wire the two together for the subset that makes
sense (one inventory-item per asset that resolves to a generated SSP), while keeping the asset
list itself a bespoke, non-OSCAL, TALOS-internal input (ADR-0026's separation still holds — assets
are never themselves imported/exported/uploaded as OSCAL documents; only their *generated*
`inventory-item` projection is).

Before drafting a plan, the actual OSCAL v1.2.2 `inventory-item` metaschema was fetched and read
directly (`src/metaschema/oscal_implementation-common_metaschema.xml` at tag `v1.2.2`), not
inferred from memory or the rendered docs site (which didn't resolve the deep-linked section) —
this surfaced two things a literal reading of the ticket would have gotten wrong:

1. `inventory-item.uuid` is a **required, real RFC4122 UUID** (OSCAL's cross-reference
   identifier). The existing `assets.csv` "uuid" column holds human tracking codes (`C001`,
   `S014`, ...) — never real UUIDs (the golden data's own README already says as much: "Original
   Kuerzel (short codes) ... preserved as UUIDs for traceability"). An early metaschema draft had
   a dedicated `asset-id` flag for exactly this kind of organizational code, but it was removed in
   favor of expressing it as `props[name="asset-id"]` — a prop, not a flag.
2. `asset-type` is likewise a `prop[name="asset-type"]`, constrained by an `allowed-values` enum
   (`operating-system`, `database`, `web-server`, `dns-server`, `email-server`,
   `directory-server`, `pbx`, `firewall`, `router`, `switch`, `storage-array`, `appliance`) but
   with `allow-other="yes"` — arbitrary values are spec-legal, the enum is a shared vocabulary to
   align with where it fits, not a closed set.

## Decision

### 1. Rename the asset list's identifier field: `uuid` → `asset-id`

`Asset.uuid` (TypeScript) / `uuid` (CSV column) becomes `Asset.assetId` / `asset-id`. This is a
rename for accuracy, not a behavior change — the values themselves stay exactly what they always
were (organizational short codes, not UUIDs). At bootstrap-generation time, a **fresh real
`crypto.randomUUID()`** is minted for each generated `inventory-item.uuid`; the asset's own
`asset-id` becomes a `props[name="asset-id"]` entry on that item. `asset_type` similarly renames
to `asset-type` (cosmetic CSV header change only — `AssetType.uuid`/`mappings.csv`'s own structure,
which the BSI target-object-category resolution in `targetObjectHierarchy.ts` depends on, is
**untouched**).

The `assets` IndexedDB object store's keyPath renames from `uuid` to `assetId` (`DB_VERSION` 3→4).
This **drops any locally-cached asset list** on upgrade (no migration of existing rows) — accepted
because assets are re-uploadable bootstrap input data, not user-authored artifacts; re-uploading
the CSV trio (or the new JSON alternative, below) restores the workspace exactly as before, same
as any re-upload today.

### 2. `asset-type` prop values align to the NIST enum where a clean match exists

Rather than a runtime lookup table in generation code, `asset_types.csv` gains one new optional
column, `oscal-asset-type`, holding the aligned NIST enum value where one clearly fits — filled in
for 5 of the 23 BSI asset types (`network-router`→`router`, `network-switch`→`switch`,
`network-firewall`→`firewall`, `application-database`→`database`, `application-web`→`web-server`);
left blank for the rest (`client-pc`, `laptop`, `server`, `building`, `room-*`,
`service-provider`, ...), which have no honest NIST-enum equivalent (the enum is
network/server-role-oriented, not asset-class-oriented, and forcing e.g. a meeting room into
`appliance` would be actively misleading). Generation falls back to the asset type's own `title`
when `oscalAssetType` is absent — always spec-legal (`allow-other`). Keeping the mapping as *data*
in the golden fixture rather than *code* means it's inspectable/editable alongside the rest of the
taxonomy, and any future custom asset-type catalog gets the same alignment mechanism for free.

### 3. New optional `assets.csv` columns cover the rest of `inventory-item`'s recognized props

`ipv4-address`, `ipv6-address`, `fqdn`, `netbios-name`, `mac-address`, `serial-number`,
`physical-location`, `vendor-name`, `uri`, `is-scanned` — every prop name the metaschema's
`inventory-item` `allowed-values` constraint recognizes, besides `asset-type`/`asset-id` (§1-2).
All optional; a blank cell means the prop is omitted from the generated item entirely (no
empty-string props). Populated only where physically plausible for that asset's type, not forced
onto every row — servers and network devices get IPs/MACs/serial numbers/hostnames; applications
get a vendor/product name (and `uri` for the web-facing one) but no IP (TALOS has no
asset-to-host mapping, so a fabricated IP for software would be a lie, not a plausible value);
rooms/buildings get only `physical-location`; service-providers get none of these (external
parties, not network-attached assets). This is the same "draft-friendly, no fabricated
completeness" judgment already applied elsewhere in the app (ADR-0004 §validity).

### 4. `SystemImplementation.inventoryItems` gets a real type

`unknown[]` becomes `InventoryItem[]` (`src/models/ssp.ts`): `uuid`, `description`
(markup-multiline), `props`, `links`, `responsibleParties`, `implementedComponents` (each an
optional `component-uuid` reference + props/links/responsible-parties/remarks), `remarks` — a
direct mirror of the metaschema assembly. `implementedComponents` is modeled (so the type is
complete and future-proof) but bootstrap generation never populates it: linking an inventory item
to `system-implementation.components` needs a components-to-assets mapping TALOS doesn't have, and
ADR-0026 already scoped `system-implementation` (components/by-components) as a manual,
post-bootstrap editing step — this ADR doesn't reopen that.

### 5. Generation: exactly one inventory-item per resolvable asset, on its own per-asset SSP

Both `generateNist.ts` and `generateBsi.ts` already produce one SSP per asset that resolves to a
target-object-category (the same gate that already seeds `system-characteristics`); each such plan
now also gets a single-element `inventoryItems: [InventoryItem]` built from that asset
(`planBuilders.buildAssetInventoryItem`). The BSI-style ISMS-wide SSP gets **no** inventory items —
it represents the ISMS as a whole, not an asset itself. `applyBootstrapPlans` writes
`systemImplementation.inventoryItems` alongside `systemCharacteristics`/`controlImplementation` on
both create and re-run-update (same idempotent-overwrite convention as ADR-0026 §7), continuing to
preserve any hand-added `components`/`users` on update.

### 6. Cross-page deep link: SSP detail → filtered asset inventory

`SspDetailPage` gains an "Inventory Items" section (description + asset-type; the asset-id is a
`<Link>`). `AssetsListPage` reads an `?asset=<id>` query param and filters its table to that one
asset, with a "show all" control to clear it — so a reviewer reading a generated SSP's inventory
entry can jump straight to that asset's full record instead of re-searching the whole list by
hand.

### 7. Asset workspace gains a JSON import/export alongside the existing CSV trio

A bespoke (non-OSCAL — same status as the CSV shape) combined JSON document,
`{ assetTypes: AssetType[], assets: Asset[] }` — `AssetType` already carries
`targetObjectCategoryUuid` post-merge, so no separate "mappings" shape is needed for JSON the way
`mappings.csv` is needed for the three-file CSV format. `AssetsListPage` gets upload/download
controls for it next to the CSV-trio upload; it replaces the whole workspace the same way a CSV
upload does.

## Alternatives considered

- **Force real UUIDs into the CSV's identifier column:** spec-purist, but breaks every existing
  golden-data code (`C001`, `S014`, ...) and makes hand-authored asset lists far less readable for
  no benefit — `asset-id` already has a proper OSCAL home. Rejected.
- **A hardcoded `asset-type` alignment table in generation code:** works, but hides the mapping
  from anyone editing the taxonomy CSV and duplicates data that belongs with the rest of
  `asset_types.csv`. Rejected in favor of the `oscal-asset-type` column (§2).
- **Fabricate IP/MAC/serial data for every asset regardless of type:** would satisfy "fill them
  with plausible data" literally but produce actively implausible rows (a meeting room with a MAC
  address). Rejected in favor of per-type population rules (§3).
- **Link inventory-items to `system-implementation.components`:** would be the most complete OSCAL
  modeling, but needs an asset↔component mapping that doesn't exist and wasn't asked for; deferred,
  consistent with ADR-0026's existing components-are-manual scoping.

## Consequences

**Positive:** the asset list's identifier finally has an honest name; `asset-type`/`asset-id`
round-trip through the correct OSCAL prop slots instead of an ad-hoc shape; bootstrap-generated
SSPs now carry a real, typed inventory instead of an empty placeholder array; the NIST-alignment
and per-type prop rules live as inspectable data/documented rules, not buried logic.

**Negative:** the `DB_VERSION` bump drops any locally-cached asset list without migration (§1) —
acceptable for re-uploadable input data, but worth calling out since it's the project's first
*breaking* IndexedDB migration (prior bumps were purely additive). `implementedComponents` stays
unpopulated by generation (§4), so a generated inventory-item never actually links to a
system-component even though the type supports it — still true to ADR-0026's existing scope line,
but a gap if a future ticket wants richer SSP generation.

## References
- ADR-0003 (OSCAL model), ADR-0004 (persistence — validity/draft-friendly convention reused for
  §3), ADR-0007 (version handling, unaffected), ADR-0017 (components/profiles deferral, reaffirmed
  in §4), ADR-0023 (props-based provenance convention, same pattern as `asset-id`/`asset-type`
  props here), ADR-0026 (asset model & bootstrap methodology — this ADR revises its
  inventory-items-unused stance for the asset-derived subset only; the CSV-trio/JSON-vs-OSCAL
  separation ADR-0026 established still holds), ADR-0027 (bulk CSV export convention extended to
  JSON here).
- NIST OSCAL v1.2.2 `inventory-item` assembly:
  `src/metaschema/oscal_implementation-common_metaschema.xml` (fetched at tag `v1.2.2` from
  `usnistgov/OSCAL`), `shared-constraints/allowed-values-property-name-asset-type-values.ent`.
- Implementation: `src/models/{asset,ssp}.ts`, `src/data/db.ts`, `src/features/bootstrap/
  {planBuilders,generateNist,generateBsi,applyPlans}.ts`, `src/features/ssps/SspDetailPage.tsx`,
  `src/features/assets/{AssetsListPage.tsx,store.ts}`, `tests/data/golden/recplast/`.
- Tests: `tests/models/asset.test.ts`, `tests/features/{assetsStore,assetsListPage,
  bootstrapGenerate,bootstrapApplyPlans}.test.ts(x)`, `tests/app/sspDetail*.test.tsx`.
