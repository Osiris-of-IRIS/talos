# ADR-0020: Visual Theme — "Ancient Guardian" (Stargate / Egyptian Motif)

- **Status:** Approved
- **Date:** 2026-07-07
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0020 (references ADR-0002, ADR-0006, ADR-0010, ADR-0011)

## Context

TALOS ships with an approved color/token architecture (ADR-0010) and symbol registry (ADR-0011),
but no foundation stylesheet exists yet — pages render as unstyled semantic HTML, several
components already reference tokens that were never defined (e.g. `var(--color-warning, …)` in
the component-definition/SSP/catalog/library list pages), and there is no dark/light toggle
mechanism at all, so ADR-0010's dark theme is currently unreachable.

The human supervisor asked for a distinctive visual identity beyond neutral tokens: lean into a
**modern Stargate / mythical-Egyptian** vibe — brass/gold, monumental stone, a "gate" motif — for
both themes. This is a deliberate brand choice, not a literal retelling of the mission
statement's naming myth (Talos is a Greek bronze automaton, not Egyptian); Stargate's own
aesthetic — ancient stone architecture read as forgotten high technology, guarding against
threats — is a close thematic fit for a tool literally named after a mechanical guardian, and
gives TALOS a memorable, non-generic identity distinct from typical dashboard UIs.

## Decision

### Scope: foundation & chrome only, not domain semantics
This ADR adds a **decorative layer** — neutral surface colors, typography, borders, and chrome —
on top of ADR-0010. It does **not** change any ADR-0010 domain/layer accent (catalogs blue,
component-definitions/SSPs green, assessment amber, threats red, risk purple, params orange,
imported muted-green-dashed, unresolved amber) or ADR-0011 symbols. Links stay neutral
(body-text color + underline) per ADR-0010 — hover states may add a gold glow/background, never
recolor the link text itself.

### Foundation tokens (Tier 1, `src/styles/tokens.css`)
Implements the ADR-0010 three-tier token architecture (previously undocumented in code):

| Token | Light ("papyrus by day") | Dark ("event horizon by night") |
|---|---|---|
| `--color-bg` | `#faf3e3` warm papyrus | `#0b0f1a` deep obsidian/night-sky |
| `--color-bg-elevated` | `#fffaf0` | `#131a2b` |
| `--color-text` | `#2b1d0e` warm near-black | `#f1e9d2` warm papyrus-cream |
| `--color-text-muted` | `#6b5842` | `#a9a08a` |
| `--color-border` | `#d8c39a` sandstone | `#2c3550` lapis-slate |
| `--color-border-strong` | `#a9822f` brass | `#d4af37` gold |
| `--color-accent-gold` | `#b8860b` | `#e5c76b` |
| `--color-warning` / `--color-error` / `--color-ok` | `#a15c00` / `#cf222e` / `#1a7f37` | `#f0b429` / `#ff6b6b` / `#3ddc84` |
| `--color-impl-muted` | `#6b7f6b` | `#7fa88f` |

These exact names/fallback values already appear inline in shipped code (`ComponentDefinitionsListPage`,
`SspListPage`, `CatalogsListPage`, `LibraryPage`) — this ADR makes them real, sourced tokens
instead of unbacked fallbacks.

### Explicit theme toggle
Per ADR-0010, theme is an explicit `data-theme="light"|"dark"` attribute on `<html>`, **never**
`@media (prefers-color-scheme)` in CSS. A shared `useTheme` hook (`src/shared/theme.ts`) sets the
attribute and persists the user's choice in `localStorage`; on first visit (no stored choice) it
reads `window.matchMedia('(prefers-color-scheme: dark)')` **once in JS** as the initial default
only — this does not violate the ADR-0010 CSS-mechanism rule and gives new users a sensible
starting theme. A `ThemeToggle` component (🌙/☀️, ADR-0011, `aria-label`+`title`) is mounted once
in the app shell (`App.tsx`) so every page can switch themes.

### Motif treatment
- **Typography:** system font stack only (no external font fetch — CSP `default-src 'self'`
  disallows remote font/style hosts). Page `h1` gets wide letter-spacing + small-caps and a
  gold-gradient underline rule to read as a monumental, carved inscription; `fieldset`/`legend`
  (used throughout the editors) get a cartouche-style double border with the legend as a small-caps
  gold label breaking the top border.
- **Chrome:** a slim gold hairline runs along the top of the app shell; a low-opacity, blurred
  radial-gradient "gate ring" glow sits behind each page's `h1` — decorative only, never reducing
  text contrast (WCAG AA maintained in both themes per ADR-0010).
- **Surfaces:** list rows/cards get a brass-accented left border matching their ADR-0010 domain
  color (keyed off existing `data-testid` values — e.g. `[data-testid="compdef-item"]` green,
  `[data-testid="catalog-item"]` blue — so no component markup changes are needed); library
  (imported/read-only) rows keep the ADR-0010 dashed muted-green treatment.
- **Buttons:** brass-bordered, subtly beveled (inset shadow), gold glow on hover/focus — evokes an
  inscribed control panel rather than a flat dashboard button.

## Consequences

**Positive:** distinctive, cohesive brand identity across every existing page with zero JSX
rewrites (pure CSS + one small toggle component); realizes the dark theme ADR-0010 already
specified but that was previously unreachable; the tokens list pages already reference are now
backed by real values instead of silent fallbacks.
**Negative:** decorative motifs (gate-ring glow, cartouche borders) add a small amount of CSS
surface to maintain; future features must keep new UI within the Tier 1/2/3 token discipline
(ADR-0010) rather than hard-coding colors, or the motif will drift.

## References
- ADR-0002 (static app shell), ADR-0006 (landing hub), ADR-0010 (color/token architecture —
  domain colors unchanged), ADR-0011 (symbols — 🌙/☀️ toggle). Implementation:
  `src/styles/tokens.css`, `src/app/app.css`, `src/shared/theme.ts`, `src/shared/ThemeToggle.tsx`.
