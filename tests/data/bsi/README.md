# BSI upstream snapshots (golden data)

Verbatim copies of files from the BSI Stand-der-Technik-Bibliothek
(https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek), licensed **CC-BY-SA-4.0**
(© Bundesamt für Sicherheit in der Informationstechnik).

| File | Upstream path | Commit |
|------|---------------|--------|
| `target_object_categories.csv` | `documentation/namespaces/target_object_categories.csv` | `c3f37859fdf302394de39e89252eb3e72a45953c` (2026-10-30) |

Used offline by TEST-TOC-05 to check that the golden recplast asset mappings
(`tests/data/golden/recplast/mappings.csv`) only reference target-object categories that exist
upstream, and that each mapping is semantically plausible under the current BSI definitions
(ADR-0039). TALOS itself always fetches the live file from `main` (PO decision Q1); refresh this
snapshot together with `src/data/library-index.json` (`node tools/gen-library-index.mjs`).
