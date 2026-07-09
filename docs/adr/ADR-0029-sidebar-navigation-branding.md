# ADR-0029: Sidebar Navigation, Logo Branding, Configurable Hero Background

- **Status:** Approved
- **Date:** 2026-07-09
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0029 (references ADR-0002, ADR-0006, ADR-0010, ADR-0012, ADR-0020)

## Context

The supervisor supplied brand assets (`logo.png`, two hero backgrounds) and asked for: a
persistent left-hand sidebar with the logo on top (clicking it goes home); the hero background
wired into the app; and the choice of hero background centralized in config, the same for every
user (not a per-user preference). Before this, TALOS had no persistent navigation at all — the
landing page's card grid *was* the only way to move between top-level sections, and the top bar
held only the theme toggle and language switcher.

Three design questions were resolved with the supervisor up front: the hero background renders
**only** on the landing page's hero header (not app-wide, to protect readability on data-heavy
pages); the sidebar is **collapsible** (a toggle button, not permanently fixed-width or replacing
the top bar); the landing page's existing card grid **stays as-is** below the hero, even though
the sidebar now duplicates its links — it still works as a dashboard/overview, and the
duplication is harmless.

## Decision

### 1. Shared navigation data (`src/app/navigation.ts`)
The landing page's `groups()`/`LayerId`/`FeatureCard` grouping (by OSCAL layer: Data, Control,
Implementation, Assessment, Assistants) was extracted verbatim into a new shared module,
`navigationGroups(hasAssets)`, so the landing page's cards and the new sidebar's links are
generated from **one** source of truth and can never drift apart. Both consumers keep their own
rendering (cards vs. a linked list) — only the *data* is shared.

### 2. `<Sidebar>` (`src/app/Sidebar.tsx`)
A persistent `<nav>` rendered as a sibling of the routed content in `App.tsx` (not per-page), so
it's present on every route. Structure: logo (wrapped in `<Link to="/">`) + a collapse-toggle
button in a header row, then `navigationGroups(hasAssets)` rendered as `<NavLink>`s (automatic
`.active` class on the current route) grouped under `<h3>` layer labels, with the same
disabled/hover-explanation treatment the landing page already used for the gated Bootstrap
Assistant link (ADR-0026). Collapse state is local `useState` (not persisted) — collapsing hides
the nav entirely and shrinks the logo to an icon, reclaiming width on content-heavy editor pages;
expanding restores both. No new abstraction for "collapsible" was introduced (this is a distinct
interaction from `<CollapsibleSection>`'s per-row expand/collapse, ADR-0028) — a plain boolean is
enough for a single, app-level toggle.

### 3. App shell restructure (`App.tsx`, `app.css`)
`.app-shell` changes from a `flex-column` (topbar above routed content) to a `flex-row`
(`<Sidebar>` beside a `.app-content` column that holds the *existing* top bar — language switcher
and theme toggle, unmoved — above `<Routes>`). The sidebar is `position: sticky; height: 100vh;
overflow-y: auto`, so it stays in view while a long page (e.g. an SSP editor form) scrolls,
independent of the main content's scroll position — expected behavior for a persistent nav, not
scope creep.

### 4. Configurable hero background, split from `config.ts` on purpose
`src/config.ts` gained `HERO_BACKGROUND: 'epic' | 'simple'` — a single, redeploy-to-change,
global constant (never a per-user preference or a user-facing setting), matching the existing
`VIEWER_URL`/`DEFAULT_LANGUAGE` precedent for "central config" in this codebase. The two images
themselves are **not** imported into `config.ts`: `tests/e2e/bootstrap.spec.ts` imports
`config.ts` directly under Node (Playwright's TS transform, not Vite), and a `@/assets/*.png`
import at that module's top level breaks under Node's/esbuild's resolution (it isn't
Vite-aware and can't turn a binary PNG into a URL string) — the whole file fails to parse,
breaking every e2e spec, not just the ones touching hero-background code. The actual
`import ... from '@/assets/hero_background*.png'` + lookup table lives in a new
`src/app/heroBackground.ts` (`heroBackgroundUrl()`), imported only by `LandingPage.tsx` — a
Vite-bundled, browser-only path e2e specs never touch directly. `LandingPage.tsx` applies the
resolved URL as an inline `style={{ backgroundImage: ... }}` on the existing `.landing-hero`
header; CSS gained a dark gradient scrim (`.landing-hero::before`) so the title/tagline stay
legible over either photo, in both themes, without a theme-specific background treatment.

### 5. Assets under `src/assets/`, not `public/`
`logo.png`, `hero_background.png`, `hero_background_simple.png` are imported via Vite
(`import x from '@/assets/...png'`), not placed in `public/` and referenced by a raw path — this
lets Vite hash filenames and resolve them correctly under the `/talos/` GitHub Pages base
(`vite.config.ts`, ADR-0002) automatically, avoiding a class of base-path bugs a hand-built
`public/`-relative URL would risk. A `src/vite-env.d.ts` (`/// <reference types="vite/client" />`)
was added — the project had never imported a binary asset before, so the ambient module
declaration for `*.png` imports didn't exist yet.

## Consequences

**Positive:** every page now has persistent, single-source-of-truth navigation instead of
navigation living only on the landing page; switching the hero background is a one-line, one-file
change with no per-user state to manage; the sidebar is collapsible so it doesn't permanently cost
horizontal space on forms.

**Negative:** both hero images ship in the production build (~12.5 MB combined) even though only
one is ever displayed — Vite can't tree-shake a runtime lookup table, and no image-compression
tooling was available in this environment to shrink the source PNGs; a follow-up to compress or
convert them (e.g. to WebP) is recommended before this is considered fully production-ready, and
was flagged to the supervisor rather than silently left. The sidebar duplicates the landing page's
link text; several e2e specs that previously did a bare `page.getByRole('link', {name: ...})` now
need `page.locator('main').getByRole(...)` to disambiguate (fixed in this change — see
`tests/e2e/{bootstrap,componentDefinitions,ssps}.spec.ts`). Collapse state resets on reload
(not persisted) — acceptable for a first pass; revisit if user feedback wants it remembered.

## References
- ADR-0002 (GitHub Pages base path), ADR-0006 (landing page), ADR-0010 (design tokens/theme),
  ADR-0012 (i18n), ADR-0020 (visual motif), ADR-0026 (disabled-link-with-explanation pattern this
  reuses), ADR-0028 (the unrelated `<CollapsibleSection>` per-row collapse this is not to be
  confused with). Implementation: `src/app/{navigation,Sidebar,heroBackground,App,LandingPage}.tsx`,
  `src/app/app.css`, `src/config.ts`, `src/vite-env.d.ts`, `src/assets/*.png`. Tests:
  `tests/app/{sidebar,landingPage}.test.tsx`, e2e locator scoping fixes in
  `tests/e2e/{bootstrap,componentDefinitions,ssps}.spec.ts` (TEST-SIDEBAR-01, extended TEST-LAND-03).
