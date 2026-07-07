# TALOS Security

Decision IDs: ADR-0002, ADR-0009, ADR-0005. Security review: todo T-502.

## Threat model (static client-side app)
No backend or server-stored data: the classic server attack surface is absent. Residual risks
are **content-injection** (malicious OSCAL), **supply-chain** (npm deps), and **external
hand-offs** (library fetch, external viewer).

## Controls
- **XSS / content injection:** all OSCAL markup rendered via the single sanitizing renderer —
  HTML-escape → safe subset → link-URL allowlist (`http`/`https`/app-relative only; reject
  `javascript:`/`data:`/`file:`/`vbscript:`); no raw HTML, no images `[ADR-0009]`.
- **Safe file parsing:** uploaded JSON is parsed defensively and schema-validated (Ajv) before
  use; malformed/oversized files are rejected with a clear error `[ADR-0003, ADR-0004]`.
- **External links & hand-off:** new tabs use `rel="noopener noreferrer"`; the external viewer
  receives only public URLs; no user data is sent off-device `[ADR-0008]`.
- **Network egress:** only the read-only BSI fetch over HTTPS `[ADR-0005]`; no telemetry, no
  third-party analytics.
- **Data privacy:** all user artifacts stay in the browser (IndexedDB); users are advised to
  export backups; no cloud sync `[ADR-0004]`.
- **Supply chain:** pinned lockfile; `npm audit` in CI; minimal dependencies (prefer the
  dependency-free markup renderer); review before adding libraries.
- **Subresource integrity / CSP:** ship a restrictive `<meta http-equiv="Content-Security-Policy">`
  (self + the BSI raw origin for fetch); no inline event handlers.

## Non-goals
No authentication/authorization (single-user, on-device); no server secrets. RBAC/multi-user
access control is out of scope.

## Verification
XSS/edge-case unit tests `[ADR-0009]`; dependency audit in CI; manual security pass (T-502)
before first release.
