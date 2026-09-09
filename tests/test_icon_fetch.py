"""Tests for the icon picker's Upload-tab "paste a link" route.

Two tiers, matching test_expression_eval.py's shape: the pure `fetch_icon_bytes`
function against a real local `http.server` origin (never the internet, per
CLAUDE.md's testing rule), then the live `SystemSketchServer` POST route to
prove it is actually registered and dispatches to that function.
"""
from __future__ import annotations

import contextlib
import json
import os
import socket
import sys
import tempfile
import threading
import time
import unittest
from http import HTTPStatus, client as http_client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock


PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT / "scripts"))

from server import (  # noqa: E402
    ICON_FETCH_ALLOW_LOCAL_ENV,
    ICON_FETCH_MAX_BYTES,
    SystemSketchServer,
    fetch_icon_bytes,
)

# WHY this constant exists: every fixture below is a local http.server on
# 127.0.0.1, and the SSRF guard added for RISK finding 2 blocks loopback
# targets by default. Tests that exercise the fetch itself opt in with this;
# tests that exercise the guard deliberately leave it unset.
ALLOW_LOCAL = {ICON_FETCH_ALLOW_LOCAL_ENV: "1"}

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
        elif self.path == "/redirect-to-loopback":
            # WHY a fixed, unreachable Location rather than a real second
            # origin: the redirect test below intercepts the per-hop host
            # check itself, so the target only needs to look like a URL —
            # fetch_icon_bytes must never get far enough to dial it.
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "http://127.0.0.1:9/mark.png")
            self.send_header("Content-Length", "0")
            self.end_headers()
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
    # WHY class-wide: every fixture in this file is a loopback origin, and
    # these tests are about the fetch mechanics (content type, size cap,
    # redirects-followed, error shapes) — the SSRF guard itself gets its own
    # tests below, deliberately without this opt-in.
    def setUp(self) -> None:
        self._env_patch = mock.patch.dict(os.environ, ALLOW_LOCAL)
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)

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


class IconFetchSsrfGuardTests(unittest.TestCase):
    """RISK finding 2: `fetch_icon_bytes` must not be a blind SSRF proxy.
    Deliberately does not opt into ALLOW_LOCAL — these tests exist to prove
    the guard fires, not to fetch a real image."""

    def test_a_loopback_target_is_blocked_without_the_allow_local_env_var(self) -> None:
        self.assertNotIn(ICON_FETCH_ALLOW_LOCAL_ENV, os.environ)
        with _Origin() as origin:
            with self.assertRaisesRegex(ValueError, "local or private address"):
                fetch_icon_bytes(f"{origin}/mark.png")

    def test_a_redirect_into_a_loopback_target_is_blocked_on_the_second_hop(self) -> None:
        # The first hop (the test origin itself) is allowed through by the
        # mock so the redirect is actually followed; the guard's second call,
        # against the Location it redirects to, is left real and must reject.
        # That proves re-validation happens per hop, not only on the URL the
        # caller originally passed in.
        with _Origin() as origin:
            with mock.patch.dict(os.environ, ALLOW_LOCAL):
                with mock.patch(
                    "server._reject_unsafe_icon_host",
                    side_effect=[None, ValueError("the URL resolves to a local or private address")],
                ) as guard:
                    with self.assertRaisesRegex(ValueError, "local or private address"):
                        fetch_icon_bytes(f"{origin}/redirect-to-loopback")
                    self.assertEqual(guard.call_count, 2)

    def test_the_allow_local_env_var_permits_a_loopback_fetch(self) -> None:
        with _Origin() as origin:
            with mock.patch.dict(os.environ, ALLOW_LOCAL):
                body, content_type = fetch_icon_bytes(f"{origin}/mark.png")
                self.assertEqual(body, TINY_PNG)
                self.assertEqual(content_type, "image/png")


class IconFetchDnsRebindingTests(unittest.TestCase):
    """RISK finding 2, the DNS-rebinding half: a check-then-connect guard
    resolves the host twice — once to vet it, once inside the connection a
    moment later — and a host that answers a public address to the first
    lookup and a loopback one to the second sails straight through. Proves
    the fix instead: the resolver is consulted exactly once per hop, and the
    connection dials the address that one lookup returned, never asking
    again. Never touches the real internet — `socket.create_connection`
    itself is replaced, so nothing here needs a route to `8.8.8.8` to work,
    only the record of what address the connection layer was told to dial."""

    def test_a_rebinding_host_never_reaches_the_address_its_second_answer_names(self) -> None:
        hit_count = 0

        class _CountingHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
                pass

            def do_GET(self) -> None:
                nonlocal hit_count
                hit_count += 1
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", "image/png")
                self.send_header("Content-Length", str(len(TINY_PNG)))
                self.end_headers()
                self.wfile.write(TINY_PNG)

        # A loopback origin that would happily answer the fetch — the target
        # a rebinding attack actually wants — which must never be dialed.
        server = ThreadingHTTPServer(("127.0.0.1", 0), _CountingHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            getaddrinfo_call_count = 0

            def rebinding_getaddrinfo(host, *args, **kwargs):
                nonlocal getaddrinfo_call_count
                getaddrinfo_call_count += 1
                # What a rebinding DNS host answers its FIRST (and, if the
                # fix holds, only) lookup — public-looking, so the guard's
                # address checks let it through.
                return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 0))]

            dialed: list[tuple[str, int]] = []

            def recording_create_connection(address, *args, **kwargs):
                dialed.append(address)
                # The loopback origin above is what a SECOND, re-resolving
                # lookup would have handed this call in the pre-fix code —
                # refusing here, rather than actually connecting to
                # anything, keeps the test off the network either way.
                raise OSError("connection refused (test double, no real socket opened)")

            with mock.patch("server.socket.getaddrinfo", side_effect=rebinding_getaddrinfo), \
                    mock.patch("server.socket.create_connection", side_effect=recording_create_connection):
                with self.assertRaisesRegex(ValueError, "could not fetch"):
                    fetch_icon_bytes(f"http://rebinding.example.test:{server.server_address[1]}/mark.png")

            self.assertEqual(getaddrinfo_call_count, 1, "the resolver must be consulted only once per hop")
            self.assertEqual(dialed, [("8.8.8.8", server.server_address[1])],
                              "the connection must dial the ONE address the guard vetted")
            self.assertEqual(hit_count, 0, "the loopback origin must never receive the request")
        finally:
            server.shutdown()
            thread.join(timeout=5)
            server.server_close()


class IconFetchEndpointTests(unittest.TestCase):
    """Drives the real SystemSketchServer over a live socket, proving the
    route is registered on the do_POST allow-list and actually dispatches to
    fetch_icon_bytes — not just that the bare function works."""

    def setUp(self) -> None:
        # These tests fetch from the local _Origin fixture (127.0.0.1); the
        # request-shape rejection tests below run without this, since they
        # never get far enough for the SSRF guard to matter.
        self._env_patch = mock.patch.dict(os.environ, ALLOW_LOCAL)
        self._env_patch.start()
        self.addCleanup(self._env_patch.stop)

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

    def test_a_non_json_content_type_is_rejected_before_the_body_is_read(self) -> None:
        # RISK finding 2(a): a text/plain form POST is a CORS-simple request
        # (no preflight), so this is the check that stops a foreign page from
        # driving the route at all.
        with self._running_server() as port:
            connection = http_client.HTTPConnection("127.0.0.1", port, timeout=10)
            connection.request(
                "POST",
                "/api/icon/fetch",
                body=json.dumps({"url": "http://example.com/mark.png"}),
                headers={"Content-Type": "text/plain"},
            )
            response = connection.getresponse()
            try:
                self.assertEqual(response.status, HTTPStatus.UNSUPPORTED_MEDIA_TYPE)
            finally:
                response.read()
                connection.close()

    def test_a_foreign_origin_is_rejected(self) -> None:
        with self._running_server() as port:
            connection = http_client.HTTPConnection("127.0.0.1", port, timeout=10)
            connection.request(
                "POST",
                "/api/icon/fetch",
                body=json.dumps({"url": "http://example.com/mark.png"}),
                headers={"Content-Type": "application/json", "Origin": "http://evil.example"},
            )
            response = connection.getresponse()
            try:
                self.assertEqual(response.status, HTTPStatus.FORBIDDEN)
            finally:
                response.read()
                connection.close()

    def test_a_127_0_0_1_origin_is_permitted(self) -> None:
        with _Origin() as origin, self._running_server() as port:
            connection = http_client.HTTPConnection("127.0.0.1", port, timeout=10)
            connection.request(
                "POST",
                "/api/icon/fetch",
                body=json.dumps({"url": f"{origin}/mark.png"}),
                headers={"Content-Type": "application/json", "Origin": "http://127.0.0.1:5173"},
            )
            response = connection.getresponse()
            try:
                self.assertEqual(response.status, HTTPStatus.OK)
                self.assertEqual(response.read(), TINY_PNG)
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
