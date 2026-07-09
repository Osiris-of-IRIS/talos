# ADR-0030: Expanded OSCAL Markup Rendering — Full Metaschema Subset

- **Status:** Approved
- **Date:** 2026-07-09
- **Deciders:** Human supervisor, engineering
- **Decision IDs:** ADR-0030 (references ADR-0009, ADR-0016)

## Context

Tester feedback on the component-definition editor: "the markdown view helper does not currently
support all OSCAL markup fields, e.g. headings are not displayed correctly," and asked for full
support of everything the NIST Metaschema datatype spec lists for `markup-line`/`markup-multiline`
(https://pages.nist.gov/metaschema/specification/datatypes/#markup-multiline).

ADR-0009's original renderer supported only bold/italic/code/links/sub/sup inline, plus
paragraphs and single-`\n`→`<br>` at the block level. The spec's actual block/inline set is
larger: headings (`#`–`######`), lists (ordered/unordered, nestable), fenced code blocks,
blockquotes, pipe tables (with column alignment), a **specialized character mapping** (backslash
escapes for `*`, `` ` ``, `~`, `^` render literally instead of triggering formatting), and
**parameter insertion** (`{{ insert: param, id }}`, the markdown-side spelling of
`<insert type="param" id-ref="…"/>`). The spec also lists images — ADR-0009 already excluded
images and raw HTML on XSS grounds, and that exclusion is deliberately **not** revisited here.

## Decision

`src/shared/oscalMarkdown.ts` keeps its ADR-0009 security model (HTML-escape first, apply a fixed
safe subset, allowlist link URLs, no raw HTML/images) but its subset now matches the spec:

- **Block parser rewrite** (`renderMultilineMarkdown`): the flat blank-line/paragraph splitter
  becomes a small block classifier that walks escaped lines and recognizes, in order: fenced code
  (` ``` `→`<pre><code>`, content emitted verbatim, never re-formatted), headings (`#`–`######`
  →`<h1>`–`<h6>`, inline-formatted), blockquotes (`>` per line →`<blockquote>` recursively
  rendering its de-prefixed content as its own block sequence), pipe tables (a header row
  followed by a `---`/`:--:`-style separator row →`<table>`, with `:`-flagged alignment mapped to
  `style="text-align:…"`), lists (contiguous `-`/`*`/`+` or `N.` lines →`<ul>`/`<ol>`, **nested**
  by recursive indentation-depth — a deeper-indented run of items nests under the preceding
  item), falling back to the existing paragraph behavior (blank-line-delimited, single `\n`→`<br>`)
  for anything else. Every block type renders its text content through the same `applyInline`
  used before, so inline formatting keeps working inside headings/list items/table cells/quotes.
- **Specialized character mapping:** `applyInline` protects `\*`, `` \` ``, `\~`, `\^` as
  sentinel tokens *before* code-span splitting/formatting run (so an escaped backtick can't be
  mistaken for a code-span delimiter, and an escaped asterisk can't be mistaken for italics),
  then restores the literal character afterward. `stripMarkdown` applies the same
  protect-then-strip-then-restore order, for the same reason — stripping italic markers before
  unescaping would otherwise eat a user's literal `*text*`.
- **Parameter insertion:** `{{ insert: param, id }}` renders as an unresolved placeholder chip,
  `<span class="markup-param-insert">‹ id ›</span>` — styled like `ControlDisplay`'s own
  `.control-param` accent (ADR-0016, ADR-0010's params-are-orange convention) but **not**
  resolved to a real value, because the generic renderer has no params context wherever it's
  used (component/metadata remarks, descriptions, etc.) — only `models/controlDisplay.ts`'s
  segment-based resolution (for a specific control's own statement, given its own `params[]` and
  a requirement's `setParameters` overrides) can show a resolved value, and is untouched by this
  change.
- **`stripMarkdown`** (plain-text fallback for titles/search) gained matching support: block
  prefixes (heading `#`, blockquote `>`, list markers) are stripped per line, table pipes become
  spaces, fenced code delimiters are removed (content kept), and `{{ insert: param, id }}`
  reduces to the bare `id`.
- **Images stay excluded** — the spec lists `<img>`↔`![alt](url)`, but ADR-0009's "no images"
  security stance is unchanged; this ADR only widens the *rest* of the subset.
- New CSS (`app.css`) styles the new block elements (headings/code/blockquote/table/lists) under
  both `.markup-view` (every read-only display) and `.markup-editor-preview` (the editor's own
  preview toggle), so the expanded syntax looks the same whether previewed while writing or
  rendered on a detail page.

## Consequences

**Positive:** every markup-multiline field in the app (component/SSP descriptions, remarks,
control prose, etc.) now round-trips and displays the full metaschema-documented author subset,
not an arbitrary smaller one; the renderer stays a single dependency-free, unit-tested module
with the same XSS guarantees as before (HTML-escape-first, no raw HTML, no images, link-URL
allowlist unchanged).

**Negative:** the block parser is meaningfully more complex than the old blank-line splitter —
mitigated by keeping every existing test passing unchanged and adding focused tests per new block
type. List nesting is depth-based on indentation only (no support for loose/tight list spacing
nuances CommonMark defines); table parsing requires a well-formed separator row (a malformed one
falls back to being rendered as a paragraph, not an error — consistent with this renderer's
existing "never throw on odd input" behavior). Parameter-insertion placeholders are always
"unresolved" outside `ControlDisplay`'s own context — acceptable since component-definition/SSP
markup fields aren't expected to actually contain catalog-style `{{ insert: … }}` syntax in
practice; this just avoids leaking raw mustache syntax if they ever do.

## References
- ADR-0009 (original renderer + security model, superseded in scope by this ADR — not in
  security posture), ADR-0016 (control-display's own, separate, resolved param-insertion
  segments, unaffected). NIST Metaschema datatypes spec (markup-line/markup-multiline).
  Implementation: `src/shared/oscalMarkdown.ts`, `src/app/app.css`. Tests:
  `tests/shared/oscalMarkdown.test.ts` (TEST-MD-01, extended).
