#!/usr/bin/env python3
"""Serve Econovaria locally and proxy browser-safe Supabase requests.

The gateway supports two explicit modes:

* connected staging, using a remote Supabase project reference and publishable key;
* local development, using the running Supabase CLI stack discovered from
  ``supabase status -o env``.

In both modes the browser receives a temporary deployment-scoped
``runtime-config.env.js`` and Edge Function traffic stays same-origin through the
loopback gateway. In local development, Supabase Auth also stays same-origin so
strict Content Security Policy remains effective. The temporary configuration is
restored or removed on shutdown.
"""

from __future__ import annotations

import argparse
import http.client
import json
import os
import signal
import subprocess
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Final
from urllib.parse import urlsplit

PROXY_PREFIXES: Final[tuple[str, ...]] = (
    "/functions/v1/",
    "/auth/v1/",
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
STATIC_NO_CACHE_HEADERS: Final[tuple[tuple[str, str], ...]] = (
    ("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"),
    ("Pragma", "no-cache"),
    ("Expires", "0"),
    ("X-Econovaria-Local-Gateway", "connected-no-cache-v1"),
)
STATIC_CONDITIONAL_HEADERS: Final[tuple[str, ...]] = (
    "If-Modified-Since",
    "If-None-Match",
)
LOCAL_DEVELOPMENT_PROJECT_REF: Final[str] = "localdevelopment0000"
LOCAL_HOSTS: Final[frozenset[str]] = frozenset({"localhost", "127.0.0.1", "::1"})


def is_proxy_path(path: str) -> bool:
    """Return whether a request path belongs to an approved Supabase browser API."""
    clean_path = urlsplit(path).path
    return any(clean_path.startswith(prefix) for prefix in PROXY_PREFIXES)


def remove_static_conditionals(headers) -> None:
    """Remove browser validators so connected local assets are always read from disk."""
    for name in STATIC_CONDITIONAL_HEADERS:
        if headers.get(name) is not None:
            del headers[name]


def filtered_request_headers(headers, upstream_host: str) -> dict[str, str]:
    """Copy end-to-end request headers and bind Host to the upstream runtime."""
    result: dict[str, str] = {}
    for name, value in headers.items():
        lower_name = name.lower()
        if lower_name in HOP_BY_HOP_HEADERS or lower_name in {"host", "content-length"}:
            continue
        result[name] = value
    result["Host"] = upstream_host
    return result


def filtered_response_headers(headers) -> list[tuple[str, str]]:
    """Return end-to-end response headers, excluding upstream CORS metadata."""
    result: list[tuple[str, str]] = []
    for name, value in headers:
        lower_name = name.lower()
        if lower_name in HOP_BY_HOP_HEADERS:
            continue
        if lower_name.startswith("access-control-"):
            continue
        result.append((name, value))
    return result


def parse_supabase_status_env(source: str) -> dict[str, str]:
    """Parse ``supabase status -o env`` without executing shell output."""
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


def local_supabase_runtime(root: Path) -> tuple[str, str]:
    """Return local Supabase API URL and browser-safe anon/publishable key."""
    command = [
        "npx",
        "supabase",
        "status",
        "-o",
        "env",
        "--workdir",
        "backend",
    ]
    result = subprocess.run(
        command,
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
    publishable_key = values.get("PUBLISHABLE_KEY") or values.get("ANON_KEY") or ""
    if not supabase_url:
        raise SystemExit("Supabase status did not return API_URL")
    if not publishable_key:
        raise SystemExit("Supabase status did not return PUBLISHABLE_KEY or ANON_KEY")

    parsed = urlsplit(supabase_url)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in LOCAL_HOSTS:
        raise SystemExit("Local Supabase API_URL must use a loopback host")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise SystemExit("Local Supabase API_URL must not include a path, query, or fragment")
    if publishable_key.startswith("sb_secret_"):
        raise SystemExit("Local Supabase returned a secret key instead of a browser-safe key")
    if not publishable_key.startswith(("sb_publishable_", "eyJ")):
        raise SystemExit("Local Supabase browser key has an unsupported format")
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


class LocalStagingHandler(SimpleHTTPRequestHandler):
    server_version = "EconovariaLocalGateway/1.3"

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

    def _proxy(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(content_length) if content_length else None
        upstream = self.server.upstream  # type: ignore[attr-defined]
        connection_type = (
            http.client.HTTPSConnection
            if upstream.scheme == "https"
            else http.client.HTTPConnection
        )
        connection = connection_type(
            upstream.hostname,
            port=upstream.port,
            timeout=30,
        )
        upstream_host = upstream.netloc

        try:
            connection.request(
                self.command,
                self.path,
                body=body,
                headers=filtered_request_headers(self.headers, upstream_host),
            )
            upstream_response = connection.getresponse()
            payload = upstream_response.read()

            self.send_response(upstream_response.status, upstream_response.reason)
            for name, value in filtered_response_headers(upstream_response.getheaders()):
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
                    "message": "The local gateway could not reach the configured Supabase runtime.",
                }
            ).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
            print(f"Local gateway upstream failure: {error}", file=sys.stderr)
        finally:
            connection.close()


class LocalStagingServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, server_address, handler_class, upstream_url: str):
        super().__init__(server_address, handler_class)
        parsed = urlsplit(upstream_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("upstream_url must be an absolute HTTP(S) URL")
        self.upstream = parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Serve Econovaria locally with a same-origin Supabase API gateway."
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
                "--project-ref or ECONOVARIA_PROJECT_REF must be the 20-character Supabase project reference"
            )
        if not publishable_key.startswith(("sb_publishable_", "eyJ")):
            raise SystemExit(
                "--publishable-key or ECONOVARIA_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable or legacy anon key"
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
    server = LocalStagingServer(
        ("127.0.0.1", args.port),
        LocalStagingHandler,
        upstream_url=supabase_url,
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
    runtime_label = "local Supabase" if args.local_supabase else "connected staging"
    print(f"Econovaria {runtime_label} gateway is running at {address}")
    print(f"Admin: {address}admin/")
    print(f"Player: {address}player-terminal/")
    auth_route = "loopback proxy" if args.local_supabase else "direct Supabase HTTPS"
    print(
        "Static assets: no-store; "
        f"Supabase Auth: {auth_route}; Edge APIs: loopback proxy."
    )
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
