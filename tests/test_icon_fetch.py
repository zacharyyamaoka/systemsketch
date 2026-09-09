"""Tests for the icon picker's Upload-tab "paste a link" route.

Two tiers, matching test_expression_eval.py's shape: the pure `fetch_icon_bytes`
function against a real local `http.server` origin (never the internet, per
CLAUDE.md's testing rule), then the live `SystemSketchServer` POST route to
prove it is actually registered and dispatches to that function.
"""
from __future__ import annotations

import contextlib
import json
import sys
import tempfile
import threading
import time
import unittest
from http import HTTPStatus, client as http_client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from server import ICON_FETCH_MAX_BYTES, SystemSketchServer, fetch_icon_bytes  # noqa: E402

# A minimal valid 1x1 transparent PNG.
TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000"
    "01f15c4890000000a49444154789c6360000002000100c3f4dd200000"
    "000049454e44ae426082"
)


class _OriginHandler(BaseHTTPRequestHandler):
    """Serves the fixed set of responses the tests below fetch from."""

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
        pass

    def do_GET(self) -> None:
        if self.path == "/mark.png":
            self._send(HTTPStatus.OK, TINY_PNG, "image/png")
        elif self.path == "/mark.svg":
            body = b"<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'></svg>"
            self._send(HTTPStatus.OK, body, "image/svg+xml")
        elif self.path == "/not-an-image.txt":
            self._send(HTTPStatus.OK, b"just some text", "text/plain")
        elif self.path == "/huge.png":
            self._send(HTTPStatus.OK, b"\0" * (ICON_FETCH_MAX_BYTES + 1024), "image/png")
        elif self.path == "/missing.png":
            self._send(HTTPStatus.NOT_FOUND, b"not found", "text/plain")
        else:
            self._send(HTTPStatus.NOT_FOUND, b"not found", "text/plain")

    def _send(self, status: HTTPStatus, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class _Origin:
    """A disposable local HTTP origin, never the real internet."""

    def __init__(self) -> None:
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), _OriginHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self) -> str:
        self.thread.start()
        return f"http://127.0.0.1:{self.server.server_address[1]}"

    def __exit__(self, *exc: object) -> None:
        self.server.shutdown()
        self.thread.join(timeout=5)
        self.server.server_close()


class FetchIconBytesTests(unittest.TestCase):
    def test_fetches_an_image_and_preserves_its_content_type(self) -> None:
        with _Origin() as origin:
            body, content_type = fetch_icon_bytes(f"{origin}/mark.png")
            self.assertEqual(body, TINY_PNG)
            self.assertEqual(content_type, "image/png")

    def test_fetches_an_svg(self) -> None:
        with _Origin() as origin:
            body, content_type = fetch_icon_bytes(f"{origin}/mark.svg")
            self.assertIn(b"<svg", body)
            self.assertEqual(content_type, "image/svg+xml")

    def test_rejects_a_non_image_response(self) -> None:
        with _Origin() as origin:
            with self.assertRaisesRegex(ValueError, "did not return an image"):
                fetch_icon_bytes(f"{origin}/not-an-image.txt")

    def test_rejects_a_response_over_the_byte_cap(self) -> None:
        with _Origin() as origin:
            with self.assertRaisesRegex(ValueError, "larger than"):
                fetch_icon_bytes(f"{origin}/huge.png")

    def test_rejects_a_non_http_scheme(self) -> None:
        with self.assertRaisesRegex(ValueError, "http and https"):
            fetch_icon_bytes("file:///etc/passwd")

    def test_rejects_a_url_with_no_host(self) -> None:
        with self.assertRaisesRegex(ValueError, "missing a host"):
            fetch_icon_bytes("https://")

    def test_surfaces_a_404_as_a_friendly_error(self) -> None:
        with _Origin() as origin:
            with self.assertRaisesRegex(ValueError, "could not fetch"):
                fetch_icon_bytes(f"{origin}/missing.png")

    def test_surfaces_a_connection_failure_as_a_friendly_error(self) -> None:
        # Nothing is listening on this port — a closed local port fails fast,
        # unlike a genuine timeout, so this stays quick without touching the
        # internet or waiting out ICON_FETCH_TIMEOUT_SECONDS.
        with self.assertRaisesRegex(ValueError, "could not fetch"):
            fetch_icon_bytes("http://127.0.0.1:1/mark.png")


class IconFetchEndpointTests(unittest.TestCase):
    """Drives the real SystemSketchServer over a live socket, proving the
    route is registered on the do_POST allow-list and actually dispatches to
    fetch_icon_bytes — not just that the bare function works."""

    @contextlib.contextmanager
    def _running_server(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            server = SystemSketchServer(
                ("127.0.0.1", 0),
                dist=root / "dist",
                channel="preview",
                build="icon-fetch-test",
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

    def _post(self, port: int, path: str, body: dict) -> http_client.HTTPResponse:
        connection = http_client.HTTPConnection("127.0.0.1", port, timeout=10)
        connection.request(
            "POST",
            path,
            body=json.dumps(body),
            headers={"Content-Type": "application/json"},
        )
        response = connection.getresponse()
        response._connection = connection  # keep it alive for the caller to read/close
        return response

    def test_route_is_registered_and_round_trips_real_bytes(self) -> None:
        with _Origin() as origin, self._running_server() as port:
            response = self._post(port, "/api/icon/fetch", {"url": f"{origin}/mark.png"})
            try:
                self.assertEqual(response.status, HTTPStatus.OK)
                self.assertEqual(response.getheader("Content-Type"), "image/png")
                self.assertEqual(response.read(), TINY_PNG)
            finally:
                response._connection.close()

    def test_a_non_image_url_is_a_malformed_request(self) -> None:
        with _Origin() as origin, self._running_server() as port:
            response = self._post(port, "/api/icon/fetch", {"url": f"{origin}/not-an-image.txt"})
            try:
                payload = json.loads(response.read())
                self.assertEqual(response.status, HTTPStatus.CONFLICT)
                self.assertIn("error", payload)
            finally:
                response._connection.close()

    def test_missing_url_field_is_a_malformed_request(self) -> None:
        with self._running_server() as port:
            response = self._post(port, "/api/icon/fetch", {})
            try:
                payload = json.loads(response.read())
                self.assertEqual(response.status, HTTPStatus.CONFLICT)
                self.assertIn("error", payload)
            finally:
                response._connection.close()

    def test_a_non_http_scheme_is_rejected(self) -> None:
        with self._running_server() as port:
            response = self._post(port, "/api/icon/fetch", {"url": "ftp://example.com/mark.png"})
            try:
                self.assertEqual(response.status, HTTPStatus.CONFLICT)
            finally:
                response._connection.close()


if __name__ == "__main__":
    unittest.main()
