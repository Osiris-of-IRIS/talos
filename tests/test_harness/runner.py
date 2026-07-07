#!/usr/bin/env python3
"""TALOS test harness (T-022). Decision IDs: ADR-0001, ADR-0018.

An *independent* contract & traceability gate. It does NOT run the JS tests -- Vitest
(`npm test`) and Playwright (`npm run test:e2e`) do that. Instead it reads the
declarative catalog `tests/tests.yaml` and enforces the auditable chain that ADR-0001
requires (ADR <-> feature <-> test) plus the golden-data contract, then emits
structured JSON-lines logs and a JUnit XML report so CI can gate on it.

Checks
  - catalog-structure : every suite/golden entry has the required keys and shape.
  - file-exists       : every `implemented` suite's `file` exists on disk.
  - traceability      : `Covers TEST-*` headers in tests/ <-> catalog ids agree; each
                        implemented suite's file references its own id (warn if not).
  - feature-linkage   : suite `feature` ids exist in feature_registry.yaml, and every
                        feature's `linked_test_ids` exists in the catalog.
  - adr-coverage      : each ADR in `adr_coverage_required` has >=1 implemented suite.
  - golden-data       : golden OSCAL fixtures parse, have the right wrapper + base
                        fields + oscal-version 1.2.2 (documents) or an id (fragments).

Full NIST v1.2.2 JSON-Schema validation of the fixtures is deferred until the schemas
are vendored (T-030); see ADR-0018.

Usage
  python3 tests/test_harness/runner.py [--catalog PATH] [--junit PATH] [--log-json PATH]
                                       [--strict] [--no-color]
Exit code 0 iff all checks pass (warnings do not fail unless --strict).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape as _xml_escape

try:
    import yaml
except ModuleNotFoundError:  # pragma: no cover - environment guard
    sys.stderr.write(
        "ERROR: PyYAML is required by the TALOS test harness.\n"
        "Install it with:  pip install -r tests/test_harness/requirements.txt\n"
    )
    sys.exit(2)

# Repo layout: tests/test_harness/runner.py  ->  repo root is two levels up.
REPO_ROOT = Path(__file__).resolve().parents[2]

# A "Covers TEST-XYZ-01" header line anywhere in a test file.
_TEST_ID_RE = re.compile(r"\bTEST-[A-Z0-9]+(?:-[A-Z0-9]+)*\b")
_REQUIRED_SUITE_KEYS = ("id", "title", "type", "status", "feature", "adr_refs")
_VALID_STATUS = {"implemented", "planned"}
_OSCAL_VERSION = "1.2.2"
_REQUIRED_METADATA_FIELDS = ("title", "last-modified", "version", "oscal-version")


@dataclass
class CheckResult:
    """One assertion outcome. `severity` is 'error' or 'warning'."""

    check: str
    passed: bool
    message: str = ""
    suite_id: str = ""
    severity: str = "error"
    decision_ids: list = field(default_factory=lambda: ["ADR-0001"])

    def __str__(self) -> str:
        tag = "PASS" if self.passed else self.severity.upper()
        loc = f" [{self.suite_id}]" if self.suite_id else ""
        return f"{tag} {self.check}{loc}: {self.message}"


# --------------------------------------------------------------------------- IO

def load_catalog(path) -> dict:
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"catalog {path} did not parse to a mapping")
    return data


def _iter_test_files(repo_root: Path):
    tests_dir = repo_root / "tests"
    for pattern in ("**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts"):
        yield from tests_dir.glob(pattern)


def _covered_ids_in_tree(repo_root: Path) -> dict[str, set[str]]:
    """TEST-id -> set of files that declare `Covers TEST-id` (or otherwise name it)."""
    found: dict[str, set[str]] = {}
    for f in _iter_test_files(repo_root):
        text = f.read_text(encoding="utf-8", errors="ignore")
        rel = str(f.relative_to(repo_root))
        for m in _TEST_ID_RE.findall(text):
            found.setdefault(m, set()).add(rel)
    return found


def _load_feature_ids(repo_root: Path) -> tuple[set[str], dict[str, list]]:
    """(feature ids, feature-id -> linked_test_ids) from feature_registry.yaml."""
    path = repo_root / "docs" / "feature_registry.yaml"
    ids: set[str] = set()
    linked: dict[str, list] = {}
    if not path.exists():
        return ids, linked
    docs = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    for entry in docs:
        if isinstance(entry, dict) and "id" in entry:
            ids.add(entry["id"])
            linked[entry["id"]] = entry.get("linked_test_ids", []) or []
    return ids, linked


# ------------------------------------------------------------------------ checks

def _check_structure(catalog: dict) -> list[CheckResult]:
    out: list[CheckResult] = []
    suites = catalog.get("suites")
    if not isinstance(suites, list) or not suites:
        return [CheckResult("catalog-structure", False, "no `suites` list in catalog")]
    seen: set[str] = set()
    for i, s in enumerate(suites):
        sid = s.get("id", f"<index {i}>")
        missing = [k for k in _REQUIRED_SUITE_KEYS if k not in s]
        if missing:
            out.append(CheckResult("catalog-structure", False, f"missing keys {missing}", sid))
            continue
        if s["status"] not in _VALID_STATUS:
            out.append(
                CheckResult("catalog-structure", False, f"invalid status {s['status']!r}", sid)
            )
        if s["status"] == "implemented" and "file" not in s:
            out.append(CheckResult("catalog-structure", False, "implemented suite has no `file`", sid))
        if s["id"] in seen:
            out.append(CheckResult("catalog-structure", False, f"duplicate id {s['id']}", sid))
        seen.add(s["id"])
    if not out:
        out.append(CheckResult("catalog-structure", True, f"{len(suites)} suites well-formed"))
    return out


def _check_files(catalog: dict, repo_root: Path) -> list[CheckResult]:
    out: list[CheckResult] = []
    for s in catalog.get("suites", []):
        if s.get("status") != "implemented":
            continue
        rel = s.get("file")
        if not rel:
            continue  # already reported by structure check
        if (repo_root / rel).is_file():
            out.append(CheckResult("file-exists", True, rel, s["id"], decision_ids=s.get("adr_refs", ["ADR-0001"])))
        else:
            out.append(
                CheckResult("file-exists", False, f"file not found: {rel}", s["id"],
                            decision_ids=s.get("adr_refs", ["ADR-0001"]))
            )
    return out


def _check_traceability(catalog: dict, repo_root: Path) -> list[CheckResult]:
    out: list[CheckResult] = []
    tree = _covered_ids_in_tree(repo_root)
    catalog_ids = {s["id"] for s in catalog.get("suites", []) if "id" in s}

    # every id declared in a test file must be catalogued
    for tid, files in sorted(tree.items()):
        if tid not in catalog_ids:
            out.append(
                CheckResult("traceability", False,
                            f"{tid} appears in {sorted(files)} but is not in tests.yaml", tid)
            )

    # every implemented suite's file should reference its own id (warn only)
    for s in catalog.get("suites", []):
        if s.get("status") != "implemented" or not s.get("file"):
            continue
        f = repo_root / s["file"]
        if not f.is_file():
            continue
        if s["id"] not in f.read_text(encoding="utf-8", errors="ignore"):
            out.append(
                CheckResult("traceability", False,
                            f"{s['file']} does not reference its id {s['id']} in a Covers header",
                            s["id"], severity="warning")
            )
    if not any(not r.passed for r in out):
        out.append(CheckResult("traceability", True,
                               f"{len(tree)} tree ids all catalogued"))
    return out


def _check_feature_linkage(catalog: dict, repo_root: Path) -> list[CheckResult]:
    out: list[CheckResult] = []
    feature_ids, linked = _load_feature_ids(repo_root)
    if not feature_ids:
        return [CheckResult("feature-linkage", False,
                            "docs/feature_registry.yaml missing or empty")]
    catalog_ids = {s["id"] for s in catalog.get("suites", []) if "id" in s}

    for s in catalog.get("suites", []):
        feat = s.get("feature")
        if feat and feat not in feature_ids:
            out.append(CheckResult("feature-linkage", False,
                                   f"unknown feature id {feat!r}", s.get("id", "")))

    # every linked_test_id in the registry must be catalogued
    for feat, tids in linked.items():
        for tid in tids:
            if tid not in catalog_ids:
                out.append(CheckResult("feature-linkage", False,
                                       f"feature {feat} links {tid} which is not in tests.yaml"))
    if not any(not r.passed for r in out):
        out.append(CheckResult("feature-linkage", True,
                               f"{len(feature_ids)} features cross-referenced"))
    return out


def _check_adr_coverage(catalog: dict) -> list[CheckResult]:
    required = catalog.get("adr_coverage_required", []) or []
    covered: set[str] = set()
    for s in catalog.get("suites", []):
        if s.get("status") == "implemented":
            covered.update(s.get("adr_refs", []) or [])
    out: list[CheckResult] = []
    for adr in required:
        if adr in covered:
            out.append(CheckResult("adr-coverage", True, f"{adr} has >=1 implemented test",
                                   decision_ids=[adr, "ADR-0001"]))
        else:
            out.append(CheckResult("adr-coverage", False,
                                   f"{adr} is required but has no implemented test",
                                   decision_ids=[adr, "ADR-0001"]))
    return out


def _check_golden(catalog: dict, repo_root: Path) -> list[CheckResult]:
    out: list[CheckResult] = []
    for gd in catalog.get("golden_data", []) or []:
        rel = gd.get("path", "<missing path>")
        did = ["ADR-0001", "ADR-0003"]
        path = repo_root / rel
        if not path.is_file():
            out.append(CheckResult("golden-data", False, f"fixture not found: {rel}",
                                   decision_ids=did))
            continue
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            out.append(CheckResult("golden-data", False, f"{rel}: invalid JSON ({e})",
                                   decision_ids=did))
            continue

        kind = gd.get("kind", "oscal-document")
        if kind == "fragment":
            key = gd.get("id_field", "id")
            if isinstance(doc, dict) and doc.get(key):
                out.append(CheckResult("golden-data", True, f"{rel}: fragment ok", decision_ids=did))
            else:
                out.append(CheckResult("golden-data", False, f"{rel}: fragment missing {key!r}",
                                       decision_ids=did))
            continue

        # oscal-document
        wrapper = gd.get("artifact_type")
        if not isinstance(doc, dict) or list(doc.keys()) != [wrapper]:
            out.append(CheckResult("golden-data", False,
                                   f"{rel}: expected single wrapper {wrapper!r}, got {list(doc)}",
                                   decision_ids=did))
            continue
        body = doc[wrapper]
        problems = []
        if not body.get("uuid"):
            problems.append("missing uuid")
        meta = body.get("metadata", {})
        for mf in _REQUIRED_METADATA_FIELDS:
            if meta.get(mf) in (None, ""):
                problems.append(f"metadata.{mf} missing")
        if meta.get("oscal-version") not in (None, _OSCAL_VERSION):
            problems.append(f"oscal-version {meta.get('oscal-version')} != {_OSCAL_VERSION}")
        if problems:
            out.append(CheckResult("golden-data", False, f"{rel}: " + "; ".join(problems),
                                   decision_ids=did))
        else:
            out.append(CheckResult("golden-data", True, f"{rel}: {wrapper} conformant",
                                   decision_ids=did))
    return out


def run_checks(catalog: dict, repo_root: Path) -> list[CheckResult]:
    """Run every check and return a flat, ordered list of results."""
    results: list[CheckResult] = []
    results += _check_structure(catalog)
    results += _check_files(catalog, repo_root)
    results += _check_traceability(catalog, repo_root)
    results += _check_feature_linkage(catalog, repo_root)
    results += _check_adr_coverage(catalog)
    results += _check_golden(catalog, repo_root)
    return results


# ----------------------------------------------------------------------- reports

def write_jsonl(results: list[CheckResult], path) -> None:
    """One structured JSON object per line (ADR-0001 observability)."""
    ts = datetime.now(timezone.utc).isoformat()
    lines = []
    for r in results:
        lines.append(json.dumps({
            "ts": ts,
            "check": r.check,
            "passed": r.passed,
            "severity": r.severity,
            "suite_id": r.suite_id,
            "message": r.message,
            "decision_ids": r.decision_ids,
        }, ensure_ascii=False))
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def write_junit(results: list[CheckResult], path) -> None:
    failures = sum(1 for r in results if not r.passed and r.severity == "error")
    total = len(results)
    suite = ET.Element("testsuite", {
        "name": "talos-harness",
        "tests": str(total),
        "failures": str(failures),
        "errors": "0",
        "skipped": "0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    for r in results:
        case = ET.SubElement(suite, "testcase", {
            "classname": f"harness.{r.check}",
            "name": f"{r.suite_id or r.check}: {r.message}"[:200],
        })
        if not r.passed:
            tag = "failure" if r.severity == "error" else "skipped"
            el = ET.SubElement(case, tag, {"message": _xml_escape(r.message)[:300]})
            el.text = f"[{','.join(r.decision_ids)}] {r.message}"
    tree = ET.ElementTree(suite)
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    tree.write(p, encoding="utf-8", xml_declaration=True)


# --------------------------------------------------------------------------- CLI

class _C:
    def __init__(self, on: bool):
        self.red = "\033[31m" if on else ""
        self.green = "\033[32m" if on else ""
        self.yellow = "\033[33m" if on else ""
        self.bold = "\033[1m" if on else ""
        self.reset = "\033[0m" if on else ""


def _print_summary(results: list[CheckResult], c: _C) -> None:
    by_check: dict[str, list[CheckResult]] = {}
    for r in results:
        by_check.setdefault(r.check, []).append(r)
    print(f"{c.bold}TALOS test harness — traceability & golden-data gate{c.reset}")
    for check, rs in by_check.items():
        errs = [r for r in rs if not r.passed and r.severity == "error"]
        warns = [r for r in rs if not r.passed and r.severity == "warning"]
        if errs:
            print(f"  {c.red}✗ {check}{c.reset}  ({len(errs)} failed / {len(rs)})")
            for r in errs:
                print(f"      {c.red}- {r.suite_id or ''} {r.message}{c.reset}")
        elif warns:
            print(f"  {c.yellow}! {check}{c.reset}  ({len(warns)} warning / {len(rs)})")
            for r in warns:
                print(f"      {c.yellow}- {r.suite_id or ''} {r.message}{c.reset}")
        else:
            print(f"  {c.green}✓ {check}{c.reset}  ({len(rs)} checks)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="TALOS declarative test harness")
    parser.add_argument("--catalog", default=str(REPO_ROOT / "tests" / "tests.yaml"))
    parser.add_argument("--junit", default=str(REPO_ROOT / "test-results" / "harness-junit.xml"))
    parser.add_argument("--log-json", default=str(REPO_ROOT / "test-results" / "harness-log.jsonl"))
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    parser.add_argument("--no-color", action="store_true")
    args = parser.parse_args(argv)

    c = _C(on=sys.stdout.isatty() and not args.no_color)
    try:
        catalog = load_catalog(args.catalog)
    except (OSError, ValueError, yaml.YAMLError) as e:
        print(f"{c.red}ERROR loading catalog: {e}{c.reset}", file=sys.stderr)
        return 2

    results = run_checks(catalog, REPO_ROOT)
    write_jsonl(results, args.log_json)
    write_junit(results, args.junit)
    _print_summary(results, c)

    errors = [r for r in results if not r.passed and r.severity == "error"]
    warnings = [r for r in results if not r.passed and r.severity == "warning"]
    passed = len(results) - len(errors) - len(warnings)
    print(f"\n{passed} passed, {len(errors)} failed, {len(warnings)} warnings "
          f"({len(results)} checks). Reports: {args.junit}")

    failed = bool(errors) or (args.strict and bool(warnings))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
