# ADR-0003: Reusable OSCAL Artifact Data Model

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor (notes.txt directive), engineering
- **Decision IDs:** ADR-0003

## Context

The OSCAL models TALOS handles — **profile, component-definition, SSP, assessment-plan,
assessment-results, POA&M** — share a large common envelope: every top-level document carries
a `uuid`, a `metadata` object (title, version, oscal-version, last-modified, roles, parties,
responsible-parties, props, links, revisions, document-ids), and an optional `back-matter`
(resources with rlinks, base64, citations, document-ids). Only the "body" differs
(`controls`/`imports` vs. `components` vs. `system-implementation`, etc.).

The supervisor directive (notes.txt) is explicit: *"ensure features common to all OSCAL
artifacts (e.g. metadata and back-matter) use a reusable OSCAL artifact data model and extend
this with the artifact-type-specific data like controls or components."*

## Decision

Model OSCAL as a **shared base + per-type extension**, in both the type layer and the UI layer.

### Type layer (`src/models/`)

```ts
// oscalBase.ts — shared envelope, spec-aligned (NIST OSCAL v1.2.2)
export interface OscalArtifact {
  uuid: string;
  metadata: Metadata;          // shared
  backMatter?: BackMatter;     // shared
}
export interface Metadata { title: MarkupLine; version: string; oscalVersion: string;
  lastModified?: string; published?: string; roles?: Role[]; parties?: Party[];
  responsibleParties?: ResponsibleParty[]; props?: Prop[]; links?: Link[];
  documentIds?: DocumentId[]; revisions?: Revision[]; remarks?: MarkupMultiline; }
export interface BackMatter { resources?: Resource[]; }

// per type: extend the base with only the body
export interface Profile extends OscalArtifact { imports: Import[]; merge?: Merge; modify?: Modify; }
export interface ComponentDefinition extends OscalArtifact {
  importComponentDefinitions?: ImportComponentDefinition[];
  components?: DefinedComponent[]; capabilities?: Capability[]; }
export interface SystemSecurityPlan extends OscalArtifact {
  importProfile: ImportProfile; systemCharacteristics: SystemCharacteristics;
  systemImplementation: SystemImplementation; controlImplementation: ControlImplementation; }
// … assessment-plan, assessment-results, poam likewise extend OscalArtifact
```

Each OSCAL document JSON is a single-key wrapper (`{"component-definition": {…}}`,
`{"system-security-plan": {…}}`, …). A small **envelope codec** maps wrapper ⇄ typed model so
the wrapper key is handled in one place.

### Shared sub-model utilities

Reusable, artifact-agnostic modules used by every type:
- **metadata codec + editor** (roles/parties/props/links/revisions/document-ids),
- **back-matter codec + editor** (resources, rlinks, citations, document-ids),
- **markup-line / markup-multiline** rendering (ADR-0009),
- **props & links** helpers (namespaced `prop`/`link` add/edit),
- **document-ids** helper (bare-UUID scheme convention).

### UI layer

A base `<ArtifactEditor>` renders the shared **Metadata** and **Back-Matter** panels and slots
a type-specific body editor (`<ComponentDefinitionBody>`, `<SspBody>`, …). New artifact types
implement only their body + codec, inheriting metadata/back-matter/validation for free.

### Validation

Ajv validators are generated per type from the NIST OSCAL v1.2.2 JSON Schemas; the shared
envelope is validated once, the body by the type schema. Import and export both validate;
failures surface as structured errors (ADR-0002 logging).

### Serialization fidelity

- Preserve unknown/round-trip fields where the spec allows extension (props, links, remarks).
- Unresolved cross-artifact references (e.g. an `import-profile` href that matches nothing in
  the local store) are **kept verbatim**, not dropped (parallels ADR-0014 import handling).

## Consequences

**Positive**
- One implementation of the common 60%+ of every OSCAL document; adding an artifact type is
  small and consistent.
- Uniform metadata/back-matter UX across all features.
- Central place to enforce OSCAL-version and schema conformance.

**Negative**
- The base abstraction must accommodate genuine per-type quirks (e.g. SSP required fields vs.
  profile) without leaking; requires care in typing (`extends` + required overrides).

**Neutral**
- TypeScript models are hand-curated against the schema rather than fully code-generated, to
  keep them ergonomic; schema tests guard drift.

## References
- NIST OSCAL v1.2.2 model outlines (profile, component-definition, SSP, assessment, POA&M).
- ADR-0009 (markup rendering), ADR-0014 (import-component-definition), ADR-0004 (persistence).
