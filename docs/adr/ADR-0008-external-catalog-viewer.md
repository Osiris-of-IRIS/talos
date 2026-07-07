# ADR-0008: Catalog & Control Viewing via the External Stand-der-Technik-Viewer

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor (Q2 of technical-design clarification), engineering
- **Decision IDs:** ADR-0008

## Context

Catalogs are **read-only sources** in TALOS (ADR-0005; no catalog CRUD). Users still need to
*view* catalog/control detail — e.g. to understand a control referenced by a
component-definition or SSP. Building a full OSCAL catalog viewer is significant scope that the
community already provides: the **BSI Stand-der-Technik-Viewer**
(`https://bsi-community.github.io/Stand-der-Technik-Viewer/`), a client-side viewer that loads
OSCAL JSON by repository selection, file upload, or **URL import**.

Investigation (2026-07-02): the hosted viewer supports loading a catalog via a pasted **public
OSCAL-JSON URL** and via file upload; it does **not** document query-parameter/hash deep-linking
to a specific control ID.

## Decision

**Do not build a full catalog viewer.** Offload full catalog/control browsing to the external
Stand-der-Technik-Viewer, and render only the minimal control information TALOS's own workflows
require.

### In TALOS (minimal, inline)
- Where an artifact references controls (component-definition `implemented-requirements`, SSP
  `control-implementation`, profile `imports`), display the **control ID** and, when the
  referenced catalog is available in the workspace or library cache, the **resolved control
  title** (markup-rendered, ADR-0009). No control prose/parts editor.
- Unresolvable control refs show the raw ID with an "unresolved" treatment (ADR-0010).

### Hand-off to the external viewer
- A **"View in Stand-der-Technik-Viewer"** action opens the viewer in a new tab
  (`target="_blank"`, `rel="noopener"`).
- For **BSI/library or otherwise publicly-hosted** catalogs (which have a `raw.githubusercontent`
  URL, ADR-0005), provide that public OSCAL-JSON URL for the viewer's URL-import (copy-to-clipboard
  + link), since there is no documented programmatic deep-link.
- For **user-uploaded/local** catalogs (no public URL), instruct the user to upload the file into
  the viewer (offer a direct download of the catalog to hand over).
- Per-control deep-linking is **not available**; we pass the catalog and the control ID for the
  user to locate. Revisit if the viewer adds a URL API.

## Alternatives considered

- **Build an in-app catalog/control viewer:** full control tree, parts, params rendering —
  large effort duplicating the external tool. Rejected for v1.
- **Embed the viewer in an iframe:** possible, but no deep-link API and cross-origin constraints
  add little over a new-tab hand-off. Rejected.

## Consequences

**Positive:** major scope reduction; users get a mature catalog viewer; TALOS focuses on the
priority authoring workflows (component-definitions, SSPs).
**Negative:** dependency on an external, separately-hosted tool (availability/version drift);
no offline catalog viewing; no per-control deep-link (user navigates within the viewer);
local catalogs require a manual upload step into the viewer.

## References
- Stand-der-Technik-Viewer (`bsi-community.github.io/Stand-der-Technik-Viewer/`).
- ADR-0005 (library/public URLs), ADR-0009 (title rendering), ADR-0010 (unresolved styling),
  ADR-0003 (control-ref resolution).
