#!/usr/bin/env python3
"""Serve Econovaria locally and proxy Supabase requests through the same origin.

This keeps browser traffic same-origin during local development while preserving
strict CORS on the connected Supabase staging project.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import signal
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Final
from urllib.parse import urlsplit

PROXY_PREFIXES: Final[tuple[str, ...]] = (
    "/auth/v1/",
    "/functions/v1/",
    "/rest/v1/",
    "/storage/v1/",
)
HOP_BY_HOP_HEADERS: Final[frozenset[str]] = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
    }
)


def is_proxy_path(path: str) -> bool:
    """Return whether a request path belongs to a proxied Supabase HTTP API."""
    clean_path = urlsplit(path).path
    return any(clean_path.startswith(prefix) for prefix in PROXY_PREFIXES)


def filtered_request_headers(headers, upstream_host: str) -> dict[str, str]:
    """Copy end-to-end request headers and bind Host to the upstream project."""
    result: dict[str, str] = {}
    for name, value in headers.items():
        lower_name = name.lower()
        if lower_name in HOP_BY_HOP_HEADERS or lower_name in {"host", "content-length"}:
            continue
        result[name] = value
    result["Host"] = upstream_host
    return result


def filtered_response_headers(headers) -> list[tuple[str, str]]:
    """Return end-to-end response headers, excluding upstream CORS metadata.

    Browser requests to this gateway are same-origin, so forwarding an upstream
    Access-Control-Allow-Origin value for a different origin is unnecessary and
    misleading.
    """
    result: list[tuple[str, str]] = []
    for name, value in headers:
        lower_name = name.lower()
        if lower_name in HOP_BY_HOP_HEADERS:
            continue
        if lower_name.startswith("access-control-"):
            continue
        result.append((name, value))
    return result


class LocalStagingHandler(SimpleHTTPRequestHandler):
    server_version = "EconovariaLocalGateway/1.0"

    def _proxy_or_serve(self) -> None:
        if is_proxy_path(self.path):
            self._proxy()
            return
        if self.command in {"GET", "HEAD"}:
            super_method = getattr(super(), f"do_{self.command}")
            super_method()
            return
        self.send_error(405, "Method not allowed for local static resources")

    def do_GET(self) -> None:  # noqa: N802
        self._proxy_or_serve()

    def do_HEAD(self) -> None:  # noqa: N802
        self._proxy_or_serve()

    def do_POST(self) -> None:  # noqa: N802
        self._proxy_or_serve()

    def do_PUT(self) -> None:  # noqa: N802
        self._proxy_or_serve()

    def do_PATCH(self) -> None:  # noqa: N802
        self._proxy_or_serve()

    def do_DELETE(self) -> None:  # noqa: N802
        self._proxy_or_serve()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._proxy_or_serve()

    def _proxy(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(content_length) if content_length else None
        upstream_host = self.server.upstream_host  # type: ignore[attr-defined]
        connection = http.client.HTTPSConnection(upstream_host, timeout=30)

        try:
            connection.request(
                self.command,
                self.path,
                body=body,
                headers=filtered_request_headers(self.headers, upstream_host),
            )
            upstream = connection.getresponse()
            payload = upstream.read()

            self.send_response(upstream.status, upstream.reason)
            for name, value in filtered_response_headers(upstream.getheaders()):
                if name.lower() == "content-length":
                    continue
                self.send_header(name, value)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
        except (OSError, http.client.HTTPException) as error:
            payload = json.dumps(
                {
                    "code": "local_gateway_upstream_failed",
                    "message": "The local gateway could not reach Supabase staging.",
                }
            ).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            print(f"Local staging gateway upstream failure: {error}", file=sys.stderr)
        finally:
            connection.close()


class LocalStagingServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, server_address, handler_class, upstream_host: str):
        super().__init__(server_address, handler_class)
        self.upstream_host = upstream_host


def runtime_config(project_ref: str, publishable_key: str, port: int) -> str:
    config = {
        "environment": "staging",
        "projectRef": project_ref,
        "supabaseUrl": f"http://127.0.0.1:{port}",
        "supabasePublishableKey": publishable_key,
    }
    return (
        "window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze("
        + json.dumps(config, separators=(",", ":"))
        + ");\n"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Serve Econovaria locally with a same-origin Supabase staging gateway."
    )
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--publishable-key", required=True)
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--open", action="store_true", dest="open_browser")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.project_ref.isalnum() or len(args.project_ref) != 20:
        raise SystemExit("--project-ref must be the 20-character Supabase project reference")
    if not args.publishable_key.startswith(("sb_publishable_", "eyJ")):
        raise SystemExit("--publishable-key must be a Supabase publishable or legacy anon key")
    if not 1 <= args.port <= 65535:
        raise SystemExit("--port must be between 1 and 65535")

    root = Path(args.root).expanduser().resolve()
    if not (root / "index.html").is_file():
        raise SystemExit(f"Repository root does not contain index.html: {root}")

    config_path = root / "runtime-config.env.js"
    previous_config = config_path.read_bytes() if config_path.exists() else None
    config_path.write_text(
        runtime_config(args.project_ref, args.publishable_key, args.port),
        encoding="utf-8",
    )

    os.chdir(root)
    server = LocalStagingServer(
        ("127.0.0.1", args.port),
        LocalStagingHandler,
        upstream_host=f"{args.project_ref}.supabase.co",
    )

    restored = False

    def restore_config() -> None:
        nonlocal restored
        if restored:
            return
        restored = True
        if previous_config is None:
            config_path.unlink(missing_ok=True)
        else:
            config_path.write_bytes(previous_config)

    def stop_server(signum, frame) -> None:  # noqa: ARG001
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, stop_server)
    signal.signal(signal.SIGTERM, stop_server)

    address = f"http://127.0.0.1:{args.port}/"
    print(f"Econovaria local staging gateway is running at {address}")
    print(f"Admin: {address}admin/")
    print(f"Player: {address}player-terminal/")
    print("Press Ctrl+C to stop.")

    if args.open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(address)).start()

    try:
        server.serve_forever(poll_interval=0.25)
    finally:
        server.server_close()
        restore_config()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
