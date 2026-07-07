"""Self-tests for the TALOS test harness (T-022). Decision IDs: ADR-0001, ADR-0018.

Written before runner.py (TDD): the harness must pass against the real catalog and
fail with a *specific* check when the catalog drifts. Stdlib `unittest` only -- no
external deps beyond PyYAML (which runner.py already requires).

Run: python3 -m unittest tests.test_harness.test_runner    (from repo root)
  or: python3 tests/test_harness/test_runner.py
"""
from __future__ import annotations

import copy
import sys
import unittest
from pathlib import Path

# Make `runner` importable whether run as a script or via `-m unittest` from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import runner  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPO_ROOT / "tests" / "tests.yaml"


def _failed_check_names(results: list[runner.CheckResult]) -> set[str]:
    return {r.check for r in results if not r.passed}


class RealCatalogTest(unittest.TestCase):
    """The shipped catalog + fixtures must be fully green."""

    def test_real_catalog_passes(self) -> None:
        catalog = runner.load_catalog(CATALOG_PATH)
        results = runner.run_checks(catalog, REPO_ROOT)
        failures = [r for r in results if not r.passed]
        self.assertEqual(
            failures, [], msg="unexpected harness failures:\n" + "\n".join(str(f) for f in failures)
        )
        # sanity: it actually ran a meaningful number of checks
        self.assertGreater(len(results), 10)

    def test_every_result_carries_decision_ids(self) -> None:
        catalog = runner.load_catalog(CATALOG_PATH)
        for r in runner.run_checks(catalog, REPO_ROOT):
            self.assertTrue(r.decision_ids, msg=f"{r.check} has no decision_ids")


class DriftDetectionTest(unittest.TestCase):
    """Each mutation must be caught by a specific named check."""

    def setUp(self) -> None:
        self.catalog = runner.load_catalog(CATALOG_PATH)

    def test_missing_file_fails_file_exists(self) -> None:
        cat = copy.deepcopy(self.catalog)
        cat["suites"].append(
            {
                "id": "TEST-BOGUS-01",
                "title": "points at a file that does not exist",
                "file": "tests/features/does_not_exist.test.tsx",
                "type": "component",
                "runner": "vitest",
                "status": "implemented",
                "feature": "PLAT-004",
                "adr_refs": ["ADR-0001"],
            }
        )
        results = runner.run_checks(cat, REPO_ROOT)
        self.assertIn("file-exists", _failed_check_names(results))

    def test_unknown_feature_fails_feature_linkage(self) -> None:
        cat = copy.deepcopy(self.catalog)
        cat["suites"][0]["feature"] = "NOPE-999"
        results = runner.run_checks(cat, REPO_ROOT)
        self.assertIn("feature-linkage", _failed_check_names(results))

    def test_uncovered_required_adr_fails_adr_coverage(self) -> None:
        cat = copy.deepcopy(self.catalog)
        cat["adr_coverage_required"].append("ADR-9999")
        results = runner.run_checks(cat, REPO_ROOT)
        self.assertIn("adr-coverage", _failed_check_names(results))

    def test_wrong_wrapper_fails_golden_data(self) -> None:
        cat = copy.deepcopy(self.catalog)
        # claim the SSP fixture is a catalog -> wrapper mismatch
        for gd in cat["golden_data"]:
            if gd["path"].endswith("ssp-minimal.json"):
                gd["artifact_type"] = "catalog"
        results = runner.run_checks(cat, REPO_ROOT)
        self.assertIn("golden-data", _failed_check_names(results))

    def test_planned_suite_without_file_is_ok(self) -> None:
        cat = copy.deepcopy(self.catalog)
        # a planned suite legitimately has no file; must not fail file-exists
        cat["suites"].append(
            {
                "id": "TEST-FUTURE-01",
                "title": "planned, no file yet",
                "type": "component",
                "runner": "vitest",
                "status": "planned",
                "feature": "PLAT-004",
                "adr_refs": ["ADR-0001"],
            }
        )
        results = runner.run_checks(cat, REPO_ROOT)
        self.assertNotIn("file-exists", _failed_check_names(results))


class JUnitOutputTest(unittest.TestCase):
    def test_writes_junit_and_jsonl(self) -> None:
        import tempfile

        catalog = runner.load_catalog(CATALOG_PATH)
        results = runner.run_checks(catalog, REPO_ROOT)
        with tempfile.TemporaryDirectory() as d:
            junit = Path(d) / "harness-junit.xml"
            jsonl = Path(d) / "harness-log.jsonl"
            runner.write_junit(results, junit)
            runner.write_jsonl(results, jsonl)
            xml = junit.read_text(encoding="utf-8")
            self.assertIn("<testsuite", xml)
            self.assertIn("tests=", xml)
            self.assertEqual(len(jsonl.read_text(encoding="utf-8").strip().splitlines()), len(results))


if __name__ == "__main__":
    unittest.main(verbosity=2)
