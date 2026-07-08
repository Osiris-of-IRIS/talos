# ADR-0025: Universal `<MarkupEditor>` Adoption for OSCAL `markup-multiline` Fields

- **Status:** Approved
- **Date:** 2026-07-08
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0025 (references ADR-0009, ADR-0022, ADR-0024)

## Context

ADR-0024 introduced `<MarkupEditor>` (`src/shared/MarkupEditor.tsx`) — a textarea with a
bold/italic/code/link toolbar and a Preview toggle — to fix specific supervisor-reported fields
(remarks, description). That ADR recorded the component's design; it did not record a durable
*policy*. The supervisor's follow-up ask is explicit: every OSCAL `markup-multiline` field the app
lets a user edit must go through this one component, not just the fields originally reported, and
that must hold for fields added later too — otherwise the app drifts back into a mix of plain
`<textarea>` and `<MarkupEditor>` the next time a new editor is built.

## Decision

**Rule:** any editable field typed `MarkupMultiline` (`src/models/oscalBase.ts`) renders through
`<MarkupEditor>` — never a bare `<textarea>`. Read-only display of the same content continues to
go through `<MarkupView>`/`<Markup>` per ADR-0022/ADR-0009; this ADR governs the *editing* side
only. `<ControlDisplay>`'s bespoke statement truncation (ADR-0016) is display-only and already out
of scope for the same reason it's excluded from ADR-0022.

### Current compliance (audited 2026-07-08)
Every `MarkupMultiline` field exposed by an editor today uses `<MarkupEditor>` — confirmed by
grep, zero bare `<textarea>` elements remain outside `MarkupEditor.tsx` itself:

- `Metadata.remarks` — `MetadataEditor`
- `DefinedComponent.description` — `ComponentDefinitionEditorPage`
- `ControlImplementation.description`, `ImplementedRequirement.description`/`remarks` — `ControlImplementationsEditor`
- `SystemCharacteristics.description`, `AuthorizationBoundary.description` — `SystemCharacteristicsEditor`
- `SystemComponent.description` (SSP) — `SystemImplementationEditor`
- `SspControlImplementation.description`, `SspImplementedRequirement.remarks`, `ByComponent.description` — `SspControlImplementationEditor`

### Not yet covered — because no editor exists yet, not because the rule was skipped
A number of `MarkupMultiline` fields exist in the model but have no editor UI at all yet (deferred
per ADR-0017/T-111 phase-1 scoping, independent of this ADR):
`BackMatter.Resource.description`/`.remarks`/`Citation.text`, `Role.description`/`.remarks`,
`Party.remarks`, `SystemUser.description`, `AuthorizedPrivilege.description`,
`SecurityImpactLevel`/`SystemInformation` detail, `Statement.description` (statements),
`Capability.description` (capabilities), and the POA&M/assessment-plan/assessment-results models
(not yet built). **When any of these gets an editor, it must use `<MarkupEditor>` from the start**
— this ADR's rule applies at the point a field becomes editable, not only retroactively.

### Enforcement
No automated lint rule enforces this today (a bare `<textarea>` bound to a `MarkupMultiline`
field would compile and pass tests silently). Reviewers should treat a new `<textarea>` touching a
`MarkupMultiline` field as a same-review fix, not a follow-up ticket. A future improvement worth
considering: an ESLint rule or a small grep-based check in the test harness (mirroring how
`tests/test_harness/runner.py` already checks other structural invariants) that fails if
`<textarea` appears anywhere under `src/features/` outside `MarkupEditor.tsx`.

## Consequences

**Positive:** one place to fix markup-editing bugs or add capability (e.g. a future toolbar
button); consistent editing experience across every artifact type; the policy is explicit instead
of implied by "whatever the last editor happened to do."
**Negative:** no automated enforcement yet, so the rule currently relies on code review discipline;
the audit above will go stale as new editors land and needs re-checking rather than trusted
blindly (a memory/documentation risk common to any point-in-time audit).

## References
- ADR-0009 (markup renderer + subset), ADR-0022 (read-only `<MarkupView>` truncate/expand — the
  display-side counterpart to this edit-side rule), ADR-0024 (introduced `<MarkupEditor>` and its
  toolbar/preview design). Implementation: `src/shared/MarkupEditor.tsx`. Model:
  `src/models/oscalBase.ts` (`MarkupMultiline` type).
