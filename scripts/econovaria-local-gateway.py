#!/usr/bin/env python3
"""Serve Econovaria through a publishable-key-only local/staging gateway.

The browser receives one deployment-scoped ``sb_publishable_`` key in runtime
configuration. The gateway validates that key in ``apikey``, removes accidental
publishable-key bearer headers, preserves real staff JWTs, preserves opaque Player
session headers, and never reads, exposes, or injects the legacy anon JWT.
"""

from __future__ import annotations

import argparse
import errno
import http.client
import json
import os
import re
import signal
import subprocess
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Final
from urllib.parse import urlsplit

DEFAULT_REQUEST_TIMEOUT_SECONDS = 180.0
MINIMUM_REQUEST_TIMEOUT_SECONDS = 30.0
MAXIMUM_REQUEST_TIMEOUT_SECONDS = 300.0
MAX_PROXY_BODY_BYTES = 1_048_576
MAX_HEADER_VALUE_BYTES = 8_192
LOCAL_DEVELOPMENT_PROJECT_REF: Final[str] = "localdevelopment0000"
LOCAL_HOSTS: Final[frozenset[str]] = frozenset({"localhost", "127.0.0.1", "::1"})
PROXY_PREFIXES: Final[tuple[str, ...]] = ("/functions/v1/", "/auth/v1/")
HEADER_NAME_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,128}$"
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
FORWARDED_IP_HEADERS: Final[frozenset[str]] = frozenset(
    {
        "cf-connecting-ip",
        "x-real-ip",
        "x-forwarded-for",
        "client-ip",
        "forwarded",
        "true-client-ip",
        "x-client-ip",
    }
)
STATIC_NO_CACHE_HEADERS: Final[tuple[tuple[str, str], ...]] = (
    ("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"),
    ("Pragma", "no-cache"),
    ("Expires", "0"),
    ("X-Econovaria-Local-Gateway", "publishable-only-v2"),
)
STATIC_CONDITIONAL_HEADERS: Final[tuple[str, ...]] = (
    "If-Modified-Since",
    "If-None-Match",
)


def clean_path(path: str) -> str:
    return urlsplit(path).path


def is_proxy_path(path: str) -> bool:
    path_only = clean_path(path)
    return any(path_only.startswith(prefix) for prefix in PROXY_PREFIXES)


def remove_static_conditionals(headers) -> None:
    for name in STATIC_CONDITIONAL_HEADERS:
        if headers.get(name) is not None:
            del headers[name]


def parse_supabase_status_env(source: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in source.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if key:
            values[key] = value
    return values


def configured_timeout() -> float:
    raw = os.environ.get(
        "ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS",
        str(DEFAULT_REQUEST_TIMEOUT_SECONDS),
    )
    try:
        value = float(raw)
    except ValueError as error:
        raise SystemExit(
            "ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS must be numeric"
        ) from error
    if not MINIMUM_REQUEST_TIMEOUT_SECONDS <= value <= MAXIMUM_REQUEST_TIMEOUT_SECONDS:
        raise SystemExit(
            "ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS must be between "
            f"{int(MINIMUM_REQUEST_TIMEOUT_SECONDS)} and "
            f"{int(MAXIMUM_REQUEST_TIMEOUT_SECONDS)} seconds"
        )
    return value


def local_supabase_runtime(root: Path) -> tuple[str, str]:
    result = subprocess.run(
        [
            "npx",
            "supabase",
            "status",
            "-o",
            "env",
            "--workdir",
            "backend",
        ],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise SystemExit(
            "Local Supabase is not running or could not be inspected. "
            "Run `npx supabase start --workdir backend` and retry."
            + (f"\n{detail}" if detail else "")
        )

    values = parse_supabase_status_env(result.stdout)
    supabase_url = values.get("API_URL", "").rstrip("/")
    publishable_key = values.get("PUBLISHABLE_KEY", "").strip()
    if not supabase_url:
        raise SystemExit("Supabase status did not return API_URL")
    if not publishable_key.startswith("sb_publishable_"):
        raise SystemExit(
            "Supabase status did not return an sb_publishable_ PUBLISHABLE_KEY"
        )

    parsed = urlsplit(supabase_url)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in LOCAL_HOSTS:
        raise SystemExit("Local Supabase API_URL must use a loopback host")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise SystemExit("Local Supabase API_URL must not include a path, query, or fragment")
    return supabase_url, publishable_key


def runtime_config(
    project_ref: str,
    publishable_key: str,
    port: int,
    *,
    environment: str = "staging",
    supabase_url: str | None = None,
) -> str:
    upstream_supabase_url = (
        supabase_url.rstrip("/")
        if supabase_url
        else f"https://{project_ref}.supabase.co"
    )
    gateway_url = f"http://127.0.0.1:{port}"
    browser_supabase_url = (
        gateway_url if environment == "development" else upstream_supabase_url
    )
    config = {
        "environment": environment,
        "projectRef": project_ref,
        "supabaseUrl": browser_supabase_url,
        "apiProxyUrl": gateway_url,
        "supabasePublishableKey": publishable_key,
    }
    return (
        "window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze("
        + json.dumps(config, separators=(",", ":"))
        + ");\n"
    )


def safe_header_pair(name: object, value: object) -> tuple[str, str] | None:
    """Return a bounded RFC token/value pair or drop untrusted header material."""
    normalized_name = str(name)
    normalized_value = str(value)
    if not HEADER_NAME_PATTERN.fullmatch(normalized_name):
        return None
    if any(character in normalized_value for character in ("\r", "\n", "\x00")):
        return None
    if len(normalized_value.encode("utf-8", errors="strict")) > MAX_HEADER_VALUE_BYTES:
        return None
    return normalized_name, normalized_value


def filtered_request_headers(
    headers,
    upstream_host: str,
    *,
    browser_publishable_key: str,
) -> dict[str, str]:
    result: dict[str, str] = {}
    prohibited_bearer = f"Bearer {browser_publishable_key}"
    for name, value in headers.items():
        pair = safe_header_pair(name, value)
        if pair is None:
            continue
        safe_name, safe_value = pair
        lower_name = safe_name.lower()
        if lower_name in HOP_BY_HOP_HEADERS or lower_name in {
            "host",
            "content-length",
        }:
            continue
        if lower_name in FORWARDED_IP_HEADERS:
            continue
        if lower_name == "authorization" and safe_value.strip() == prohibited_bearer:
            continue
        result[safe_name] = safe_value
    result["Host"] = upstream_host
    result["x-real-ip"] = "127.0.0.1"
    return result


def filtered_response_headers(headers) -> list[tuple[str, str]]:
    result: list[tuple[str, str]] = []
    for name, value in headers:
        pair = safe_header_pair(name, value)
        if pair is None:
            continue
        safe_name, safe_value = pair
        lower_name = safe_name.lower()
        if lower_name in HOP_BY_HOP_HEADERS or lower_name.startswith("access-control-"):
            continue
        result.append((safe_name, safe_value))
    return result


class EconovariaGatewayHandler(SimpleHTTPRequestHandler):
    server_version = "EconovariaGateway/2.1"

    def _is_static_request(self) -> bool:
        return not is_proxy_path(self.path)

    def send_head(self):
        if self._is_static_request():
            remove_static_conditionals(self.headers)
        return super().send_head()

    def end_headers(self) -> None:
        if self._is_static_request():
            for name, value in STATIC_NO_CACHE_HEADERS:
                self.send_header(name, value)
        super().end_headers()

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

    def _send_json_error(self, status: int, code: str, message: str) -> None:
        payload = json.dumps({"code": code, "message": message}).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _proxy(self) -> None:
        server = self.server  # type: ignore[assignment]
        publishable_key = server.publishable_key  # type: ignore[attr-defined]

        if self.command != "OPTIONS":
            supplied_key = str(self.headers.get("apikey") or "").strip()
            if supplied_key != publishable_key:
                self._send_json_error(
                    401,
                    "invalid_publishable_key",
                    "The request did not include the configured publishable API key.",
                )
                return

        raw_content_length = str(self.headers.get("Content-Length") or "0").strip()
        try:
            content_length = int(raw_content_length)
        except ValueError:
            self._send_json_error(400, "invalid_content_length", "Content-Length is invalid.")
            return
        if content_length < 0 or content_length > MAX_PROXY_BODY_BYTES:
            self._send_json_error(
                413,
                "request_body_too_large",
                "The request body exceeds the local gateway limit.",
            )
            return

        body = self.rfile.read(content_length) if content_length else None
        upstream = server.upstream  # type: ignore[attr-defined]
        connection_type = (
            http.client.HTTPSConnection
            if upstream.scheme == "https"
            else http.client.HTTPConnection
        )
        connection = connection_type(
            upstream.hostname,
            port=upstream.port,
            timeout=server.request_timeout,  # type: ignore[attr-defined]
        )

        try:
            connection.request(
                self.command,
                self.path,
                body=body,
                headers=filtered_request_headers(
                    self.headers,
                    upstream.netloc,
                    browser_publishable_key=publishable_key,
                ),
            )
            upstream_response = connection.getresponse()
            payload = upstream_response.read()

            self.send_response(upstream_response.status)
            for name, value in filtered_response_headers(upstream_response.getheaders()):
                if name.lower() == "content-length":
                    continue
                self.send_header(name, value)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(payload)
        except (OSError, http.client.HTTPException) as error:
            self._send_json_error(
                502,
                "local_gateway_upstream_failed",
                "The local gateway could not reach the configured Supabase runtime.",
            )
            print(f"Local gateway upstream failure: {error}", file=sys.stderr)
        finally:
            connection.close()


class EconovariaGatewayServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        server_address,
        handler_class,
        *,
        upstream_url: str,
        publishable_key: str,
        request_timeout: float,
    ):
        super().__init__(server_address, handler_class)
        parsed = urlsplit(upstream_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("upstream_url must be an absolute HTTP(S) URL")
        self.upstream = parsed
        self.publishable_key = publishable_key
        self.request_timeout = request_timeout


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Serve Econovaria with publishable-only Supabase browser identity."
    )
    parser.add_argument("--local-supabase", action="store_true")
    parser.add_argument("--project-ref")
    parser.add_argument("--publishable-key")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--open", action="store_true", dest="open_browser")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not 1 <= args.port <= 65535:
        raise SystemExit("--port must be between 1 and 65535")

    root = Path(args.root).expanduser().resolve()
    if not (root / "index.html").is_file():
        raise SystemExit(f"Repository root does not contain index.html: {root}")

    if args.local_supabase:
        if args.project_ref or args.publishable_key:
            raise SystemExit(
                "--local-supabase cannot be combined with --project-ref or --publishable-key"
            )
        supabase_url, publishable_key = local_supabase_runtime(root)
        project_ref = LOCAL_DEVELOPMENT_PROJECT_REF
        environment = "development"
    else:
        project_ref = args.project_ref or os.environ.get("ECONOVARIA_PROJECT_REF", "")
        publishable_key = args.publishable_key or os.environ.get(
            "ECONOVARIA_SUPABASE_PUBLISHABLE_KEY", ""
        )
        if not project_ref.isalnum() or len(project_ref) != 20:
            raise SystemExit(
                "--project-ref or ECONOVARIA_PROJECT_REF must be the 20-character "
                "Supabase project reference"
            )
        if not publishable_key.startswith("sb_publishable_"):
            raise SystemExit(
                "--publishable-key or ECONOVARIA_SUPABASE_PUBLISHABLE_KEY must be "
                "an sb_publishable_ key"
            )
        supabase_url = f"https://{project_ref}.supabase.co"
        environment = "staging"

    config_path = root / "runtime-config.env.js"
    previous_config = config_path.read_bytes() if config_path.exists() else None
    config_path.write_text(
        runtime_config(
            project_ref,
            publishable_key,
            args.port,
            environment=environment,
            supabase_url=supabase_url,
        ),
        encoding="utf-8",
    )

    os.chdir(root)
    try:
        server = EconovariaGatewayServer(
            ("127.0.0.1", args.port),
            EconovariaGatewayHandler,
            upstream_url=supabase_url,
            publishable_key=publishable_key,
            request_timeout=configured_timeout(),
        )
    except OSError as error:
        if error.errno == errno.EADDRINUSE:
            raise SystemExit(
                f"Port {args.port} is already in use. Stop the existing gateway "
                "before starting another dev session."
            ) from error
        raise

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
    runtime_label = "local Supabase" if args.local_supabase else "connected staging"
    print(f"Econovaria {runtime_label} gateway is running at {address}")
    print(f"Admin: {address}admin/")
    print(f"Player: {address}player-terminal/")
    print(
        "Browser credential contract: publishable apikey only; real staff JWTs "
        "and opaque Player sessions preserved."
    )
    print(f"Gateway upstream request timeout: {server.request_timeout:g} seconds")
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
