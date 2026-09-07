from __future__ import annotations

import contextlib
import json
import sys
import tempfile
import threading
import time
import unittest
from http import HTTPStatus, client as http_client
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from expression_eval import clamp, evaluate_expression, extract_used_names  # noqa: E402
from server import SystemSketchServer  # noqa: E402


class ClampTests(unittest.TestCase):
    def test_within_range_is_unchanged(self) -> None:
        self.assertEqual(clamp(0.5, 0, 1), 0.5)

    def test_below_range_snaps_to_low(self) -> None:
        self.assertEqual(clamp(-1, 0, 1), 0)

    def test_above_range_snaps_to_high(self) -> None:
        self.assertEqual(clamp(5, 0, 1), 1)


class ExtractUsedNamesTests(unittest.TestCase):
    def test_string_literal_contents_are_never_treated_as_names(self) -> None:
        expr = '"width" + str(width)'
        occurrences = extract_used_names(expr)
        self.assertEqual([item["name"] for item in occurrences], ["str", "width"])
        # Every span must slice back to exactly the name it claims to be.
        for item in occurrences:
            self.assertEqual(expr[item["start"]:item["end"]], item["name"])

    def test_keywords_are_never_treated_as_names(self) -> None:
        self.assertEqual(extract_used_names("True and False"), [])

    def test_syntax_error_returns_empty_list_without_raising(self) -> None:
        self.assertEqual(extract_used_names("./input"), [])

    def test_repeated_name_returns_one_entry_per_occurrence(self) -> None:
        occurrences = extract_used_names("width + width")
        self.assertEqual([item["name"] for item in occurrences], ["width", "width"])
        self.assertEqual([item["start"] for item in occurrences], [0, 8])


class EvaluateExpressionTests(unittest.TestCase):
    def test_plain_numeric_literal(self) -> None:
        self.assertEqual(
            evaluate_expression("0.1", {}),
            {"ok": True, "value": 0.1, "repr": "0.1", "usedNames": []},
        )

    def test_plain_string_literal(self) -> None:
        self.assertEqual(
            evaluate_expression("'raw'", {}),
            {"ok": True, "value": "raw", "repr": "'raw'", "usedNames": []},
        )

    def test_plain_bool_literal(self) -> None:
        self.assertEqual(
            evaluate_expression("True", {}),
            {"ok": True, "value": True, "repr": "True", "usedNames": []},
        )

    def test_bare_undefined_word_reports_its_span_and_stays_undefined(self) -> None:
        # This is today's bytes-port fixture content: prove it never crashes.
        result = evaluate_expression("raw", {})
        self.assertFalse(result["ok"])
        self.assertEqual(
            result["usedNames"],
            [{"name": "raw", "start": 0, "end": 3, "defined": False, "value": None,
              "error": "name 'raw' is not defined"}],
        )

    def test_genuine_syntax_error_does_not_raise(self) -> None:
        result = evaluate_expression("./input", {})
        self.assertFalse(result["ok"])
        self.assertIn("syntax", result["error"].lower())
        self.assertEqual(result["usedNames"], [])

    def test_arithmetic_referencing_a_registry_name(self) -> None:
        result = evaluate_expression("chassis_width / 4", {"chassis_width": "0.42"})
        self.assertTrue(result["ok"])
        self.assertAlmostEqual(result["value"], 0.105)
        used = {item["name"]: item for item in result["usedNames"]}
        self.assertTrue(used["chassis_width"]["defined"])
        self.assertEqual(used["chassis_width"]["value"], 0.42)

    def test_transitive_registry_reference(self) -> None:
        result = evaluate_expression("a", {"a": "b", "b": "0.42"})
        self.assertEqual(result["ok"], True)
        self.assertEqual(result["value"], 0.42)

    def test_direct_self_cycle_reports_circular_reference_without_hanging(self) -> None:
        started = time.monotonic()
        result = evaluate_expression("a", {"a": "a"})
        self.assertLess(time.monotonic() - started, 2, "a self-cycle must resolve immediately, never hang")
        self.assertFalse(result["ok"])
        self.assertIn("circular", result["error"].lower())

    def test_indirect_cycle_reports_the_full_chain_without_hanging(self) -> None:
        started = time.monotonic()
        result = evaluate_expression("a", {"a": "b", "b": "a"})
        self.assertLess(time.monotonic() - started, 2, "an indirect cycle must resolve immediately, never hang")
        self.assertFalse(result["ok"])
        self.assertIn("circular reference: a -> b -> a", result["error"])

    def test_safe_namespace_functions(self) -> None:
        self.assertEqual(evaluate_expression("clamp(0.5, 0, 1)", {})["value"], 0.5)
        self.assertEqual(evaluate_expression("sin(0)", {})["value"], 0.0)
        self.assertEqual(evaluate_expression("sqrt(4)", {})["value"], 2.0)

    def test_dunder_attribute_access_is_rejected(self) -> None:
        result = evaluate_expression("(1).__class__", {})
        self.assertFalse(result["ok"])
        self.assertIn("__class__", result["error"])
        self.assertNotIn("value", result)

    def test_dunder_import_call_is_rejected_and_never_runs(self) -> None:
        # __import__ isn't in the safe namespace and there are no builtins,
        # so this NameErrors before eval() ever runs — confirm it stays a
        # plain rejection rather than importing anything.
        result = evaluate_expression("__import__('os')", {})
        self.assertFalse(result["ok"])
        self.assertIn("__import__", result["error"])
        self.assertIn("not defined", result["error"])

    def test_lambda_is_rejected(self) -> None:
        result = evaluate_expression("(lambda: 1)()", {})
        self.assertFalse(result["ok"])
        self.assertIn("lambda", result["error"].lower())

    def test_import_statement_is_a_syntax_error_not_a_crash(self) -> None:
        result = evaluate_expression("import os", {})
        self.assertFalse(result["ok"])

    def test_missing_registry_is_treated_as_empty(self) -> None:
        result = evaluate_expression("1 + 1", None)  # type: ignore[arg-type]
        self.assertEqual(result, {"ok": True, "value": 2, "repr": "2", "usedNames": []})


class ExpressionEndpointTests(unittest.TestCase):
    """Drives the real SystemSketchServer over a live socket, proving the
    route is registered on the do_POST allow-list and actually dispatches to
    expression_eval — not just that the bare function works."""

    @contextlib.contextmanager
    def _running_server(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            server = SystemSketchServer(
                ("127.0.0.1", 0),
                dist=root / "dist",
                channel="preview",
                build="expression-eval-test",
                release_home=root / "runtime",
                source_root=PROJECT_ROOT,
                files_root=root / "files",
            )
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                yield server.server_address[1]
            finally:
                server.shutdown()
                thread.join(timeout=5)
                server.server_close()

    def _post(self, port: int, path: str, body: dict) -> tuple[int, dict]:
        connection = http_client.HTTPConnection("127.0.0.1", port, timeout=5)
        try:
            connection.request(
                "POST",
                path,
                body=json.dumps(body),
                headers={"Content-Type": "application/json"},
            )
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_route_is_registered_and_round_trips_a_real_request(self) -> None:
        with self._running_server() as port:
            status, payload = self._post(
                port,
                "/api/expression/evaluate",
                {"expr": "chassis_width / 4", "registry": {"chassis_width": "0.42"}},
            )
            self.assertEqual(status, HTTPStatus.OK)
            self.assertTrue(payload["ok"])
            self.assertAlmostEqual(payload["value"], 0.105)

    def test_a_failed_evaluation_is_still_http_200(self) -> None:
        with self._running_server() as port:
            status, payload = self._post(port, "/api/expression/evaluate", {"expr": "raw", "registry": {}})
            self.assertEqual(status, HTTPStatus.OK)
            self.assertFalse(payload["ok"])

    def test_omitted_registry_defaults_to_empty(self) -> None:
        with self._running_server() as port:
            status, payload = self._post(port, "/api/expression/evaluate", {"expr": "1 + 1"})
            self.assertEqual(status, HTTPStatus.OK)
            self.assertEqual(payload["value"], 2)

    def test_missing_expr_field_is_a_malformed_request(self) -> None:
        # Matches this file's existing convention (see /api/settings/file-access):
        # a malformed POST body surfaces through _post_failure_status as 409,
        # not a bespoke 400 shape.
        with self._running_server() as port:
            status, payload = self._post(port, "/api/expression/evaluate", {})
            self.assertEqual(status, HTTPStatus.CONFLICT)
            self.assertIn("error", payload)


if __name__ == "__main__":
    unittest.main()
