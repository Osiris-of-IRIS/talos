# ADR-0005: BSI Stand-der-Technik-Bibliothek Integration

- **Status:** Approved
- **Date:** 2026-07-02
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0005

## Context

The mission requires that OSCAL artifacts are either uploaded by the user **or** already
available from the **BSI Stand-der-Technik-Bibliothek**, which should be *read at the start*.
Source: `https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek` (CC-BY-SA-4.0).

Verified repository layout (2026-07-02):

```
Anwenderkataloge/<name>/<name>-catalog.json          # OSCAL catalogs (Grundschutz++, Mindeststandard-TLS)
Quellkataloge/<name>/…-catalog.json                  # source catalogs (Kernel, Methodik, Risikomanagement)
Implementierungsbeschreibungen/Komponenten/<name>/…  # component-definitions (AWS, Netzarchitektur, Passwortrichtlinie, WLAN)
Dokumentation/                                        # OSCAL guidance
```

The library ships **catalogs and component-definitions**; profiles, SSPs, and assessment
artifacts are user-created. As a static app, TALOS can only fetch this content client-side.

## Decision

### Fetch strategy

- Fetch BSI content over HTTPS from **`raw.githubusercontent.com`**
  (`https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/<path>`),
  which returns `Access-Control-Allow-Origin: *` and so is reachable from the browser.
- Discover contents via a **generated `library-index.json` manifest** committed to the TALOS
  repo (built by a small maintenance script from the GitHub Contents API). This avoids hitting
  the unauthenticated GitHub API at runtime (60 req/h/IP limit) and pins a known-good set;
  the manifest records `{ path, artifactType, title, sha, size }` per file. A "refresh from
  upstream" action can re-fetch when online.

### Loading & caching

- On startup, load the manifest, then **lazily** fetch individual artifacts on demand (browsing
  a catalog fetches that file), caching results in the `libraryCache` IndexedDB store keyed by
  path + `sha` (ADR-0004). "Read at start" = the *index* is read at start; large catalog bodies
  are fetched when first opened, to keep startup fast.
- Cached entries are reused offline; a background refresh compares `sha` and updates.

### Provenance & read-only

- Library artifacts are stored with `origin: library` and shown with a **read-only provenance
  badge** (muted implementation-green per ADR-0010). Users cannot edit library artifacts
  in place; they **adopt** (copy into their workspace as `origin: user`, new `uuid`) to tailor
  them — mirroring how imported content is treated (ADR-0014).
- Attribution/licence (CC-BY-SA-4.0) is surfaced in the library browser and README.

### Errors & resilience

- Fetch has timeout + limited retry with backoff; failures degrade gracefully to
  cached/offline content with a yellow warning, never a hard crash (ADR-0002 error handling).
- All library operations log with `decision_ids: [ADR-0005]`.

## Alternatives considered

- **Runtime GitHub Contents API traversal:** avoids a committed manifest but risks the 60/h
  unauthenticated rate limit and slower startup. Rejected as the default; kept as the
  manifest-generation tool.
- **Bundling the BSI files into the build:** guarantees offline and speed but bloats the
  bundle and stales quickly against upstream. Rejected; caching gives most of the benefit.

## Consequences

**Positive**
- Users get the BSI catalogs/components immediately without uploading anything.
- Manifest pins a reproducible, rate-limit-safe library set; caching enables offline use.
- Clear provenance and licence handling; adopt-to-edit keeps upstream pristine.

**Negative**
- Manifest must be regenerated to track upstream additions (a maintenance script + CI job).
- Dependent on `raw.githubusercontent.com` CORS/availability (mitigated by cache).

## References
- BSI Stand-der-Technik-Bibliothek (CC-BY-SA-4.0).
- ADR-0002 (fetch/error handling), ADR-0003 (validation on load), ADR-0004 (cache store),
  ADR-0010 (provenance badge), ADR-0014 (adopt/read-only pattern).
