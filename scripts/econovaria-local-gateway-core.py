#!/usr/bin/env python3
"""Serve Econovaria through a publishable-key-only local/staging gateway.

The browser receives one deployment-scoped ``sb_publishable_`` key in runtime
configuration. The gateway validates that key in ``apikey``, removes accidental
publishable-key bearer headers, preserves real staff JWTs and opaque Player
sessions, overwrites client-IP metadata, and never reads or exposes a privileged
Supabase credential.
"""

from __future__ import annotations

import argparse
import base64
import errno
import hashlib
import hmac
import http.client
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import uuid
import webbrowser
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Final
from urllib.parse import quote, unquote_to_bytes, urlsplit

DEFAULT_REQUEST_TIMEOUT_SECONDS = 180.0
MINIMUM_REQUEST_TIMEOUT_SECONDS = 30.0
MAXIMUM_REQUEST_TIMEOUT_SECONDS = 300.0
MAX_PROXY_BODY_BYTES = 1_048_576
MAX_HEADER_VALUE_BYTES = 8_192
MAX_REQUEST_TARGET_BYTES = 8_192
MAX_SESSION_ENVELOPE_BYTES = 3_964
MAX_HOSTED_BFF_PATH_BYTES = 2_048
LOCAL_DEVELOPMENT_PROJECT_REF: Final[str] = "localdevelopment0000"
LOCAL_HOSTS: Final[frozenset[str]] = frozenset({"localhost", "127.0.0.1", "::1"})
PROXY_PREFIXES: Final[tuple[str, ...]] = ("/functions/v1/", "/auth/v1/")
WEB_SESSION_PREFIX: Final[str] = "/functions/v1/web-session-api"
PLAYER_WEB_SESSION_PREFIX: Final[str] = "/functions/v1/player-web-session-api"
HOSTED_ADMIN_BFF_PREFIX: Final[str] = "/api/admin"
LOCAL_SESSION_COOKIE: Final[str] = "econovaria_admin_session"
REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_admin_session"
PLAYER_LOCAL_SESSION_COOKIE: Final[str] = "econovaria_player_session"
PLAYER_REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_player_session"
ADMIN_BFF_TIMESTAMP_HEADER: Final[str] = "x-econovaria-bff-timestamp"
ADMIN_BFF_NONCE_HEADER: Final[str] = "x-econovaria-bff-nonce"
ADMIN_BFF_CLIENT_IP_HEADER: Final[str] = "x-econovaria-bff-client-ip"
ADMIN_BFF_SIGNATURE_HEADER: Final[str] = "x-econovaria-bff-signature"
ADMIN_BFF_MODE_HEADER: Final[str] = "x-econovaria-bff-mode"
ADMIN_BFF_SIGNATURE_VERSION: Final[str] = "econovaria-admin-bff-request-v1"
ADMIN_BFF_SIGNING_KEY_CONTEXT: Final[bytes] = (
    b"econovaria-admin-bff-signing-key-v1"
)
ADMIN_BFF_LOCAL_SIGNING_MATERIAL: Final[bytes] = (
    b"econovaria-local-admin-bff-public-development-material-v1"
)
ADMIN_BFF_LOCAL_TARGET_ORIGIN: Final[str] = "http://kong:8000"
ADMIN_BFF_SIGNED_CONTEXT_HEADERS: Final[tuple[str, ...]] = (
    "content-type",
    "cookie",
    "x-econovaria-csrf-token",
    "x-econovaria-device-id",
    "x-econovaria-game-id",
    "x-idempotency-key",
    "x-request-id",
)
HEADER_NAME_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,128}$"
)
INVALID_PERCENT_ESCAPE_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"%(?![0-9A-Fa-f]{2})"
)
SAFE_REQUEST_ID_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^[A-Za-z0-9._:-]{1,128}$"
)
SESSION_ENVELOPE_PATTERN: Final[re.Pattern[str]] = re.compile(
    r"^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{24,3900})$"
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
REQUEST_HEADER_ALLOWLIST: Final[dict[str, str]] = {
    "accept": "Accept",
    "authorization": "Authorization",
    "content-type": "Content-Type",
    "apikey": "apikey",
    "origin": "Origin",
    "x-econovaria-csrf-token": "x-econovaria-csrf-token",
    "x-econovaria-device-id": "x-econovaria-device-id",
    "x-econovaria-game-id": "x-econovaria-game-id",
    "x-idempotency-key": "x-idempotency-key",
    "x-request-id": "x-request-id",
    "x-stock-market-runner-secret": "x-stock-market-runner-secret",
}
STATIC_NO_CACHE_HEADERS: Final[tuple[tuple[str, str], ...]] = (
    ("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0"),
    ("Pragma", "no-cache"),
    ("Expires", "0"),
    ("X-Econovaria-Local-Gateway", "publishable-only-v3"),
    ("X-Content-Type-Options", "nosniff"),
    ("Referrer-Policy", "no-referrer"),
)
STATIC_CONDITIONAL_HEADERS: Final[tuple[str, ...]] = (
    "If-Modified-Since",
    "If-None-Match",
)
CONTENT_TYPE_ALLOWLIST: Final[dict[str, str]] = {
    "application/json": "application/json; charset=utf-8",
    "application/problem+json": "application/problem+json; charset=utf-8",
    "application/octet-stream": "application/octet-stream",
    "text/csv": "text/csv; charset=utf-8",
    "text/event-stream": "text/event-stream; charset=utf-8",
    "text/plain": "text/plain; charset=utf-8",
}


@dataclass(frozen=True)
class SafeResponseMetadata:
    content_type: str
    retry_after: str | None
    request_id: str | None
    session_cookie: str | None


def clean_path(path: str) -> str:
    return urlsplit(path).path


def is_hosted_admin_bff_path(path: str) -> bool:
    path_only = clean_path(path)
    return path_only == HOSTED_ADMIN_BFF_PREFIX or path_only.startswith(
        f"{HOSTED_ADMIN_BFF_PREFIX}/"
    )


def is_proxy_path(path: str) -> bool:
    if len(path.encode("utf-8", errors="strict")) > MAX_REQUEST_TARGET_BYTES:
        return False
    path_only = clean_path(path)
    return is_hosted_admin_bff_path(path) or any(
        path_only.startswith(prefix) for prefix in PROXY_PREFIXES
    )


def is_admin_web_session_path(path: str) -> bool:
    path_only = clean_path(path)
    return path_only == WEB_SESSION_PREFIX or path_only.startswith(
        f"{WEB_SESSION_PREFIX}/"
    )


def is_player_web_session_path(path: str) -> bool:
    path_only = clean_path(path)
    return path_only == PLAYER_WEB_SESSION_PREFIX or path_only.startswith(
        f"{PLAYER_WEB_SESSION_PREFIX}/"
    )


def is_web_session_path(path: str) -> bool:
    return is_admin_web_session_path(path) or is_player_web_session_path(path)


def _strict_percent_decode(value: str) -> str:
    if INVALID_PERCENT_ESCAPE_PATTERN.search(value):
        raise ValueError("invalid percent escape")
    return unquote_to_bytes(value).decode("utf-8", errors="strict")


def _filtered_hosted_admin_query(query: str) -> str:
    if not query:
        return ""
    if len(query.encode("utf-8", errors="strict")) > MAX_HOSTED_BFF_PATH_BYTES:
        raise ValueError("Admin BFF query is too long")
    kept: list[str] = []
    components = query.split("&")
    if len(components) > 100:
        raise ValueError("Admin BFF query has too many fields")
    for component in components:
        decoded_component = _strict_percent_decode(component.replace("+", " "))
        if any(character in decoded_component for character in ("\r", "\n", "\x00")):
            raise ValueError("Admin BFF query contains a control character")
        raw_name = component.partition("=")[0]
        decoded_name = _strict_percent_decode(raw_name.replace("+", " "))
        if decoded_name == "path":
            continue
        kept.append(component)
    return "&".join(kept)


def local_admin_bff_upstream_path(path: str, *, local_supabase: bool) -> str | None:
    """Map the hosted Admin route only for an explicitly local Supabase runtime."""
    if not is_hosted_admin_bff_path(path):
        return None
    if not local_supabase:
        raise PermissionError("hosted-style Admin BFF routes require --local-supabase")

    parsed = urlsplit(path)
    if parsed.fragment:
        raise ValueError("Admin BFF request targets must not include fragments")
    raw_suffix = parsed.path[len(HOSTED_ADMIN_BFF_PREFIX):]
    if not raw_suffix.startswith("/") or raw_suffix == "/":
        raise ValueError("Admin BFF path must include a route suffix")

    decoded_suffix = _strict_percent_decode(raw_suffix)
    # Match the hosted catch-all plus proxy's two decode boundaries while still
    # failing closed on double-encoded traversal and backslash aliases.
    if "%" in decoded_suffix:
        decoded_suffix = _strict_percent_decode(decoded_suffix)
    if "\\" in decoded_suffix or any(
        character in decoded_suffix for character in ("\r", "\n", "\x00")
    ):
        raise ValueError("Admin BFF path contains an unsafe character")
    segments = decoded_suffix.split("/")[1:]
    if not segments or any(segment in {"", ".", ".."} for segment in segments):
        raise ValueError("Admin BFF path contains an unsafe segment")
    if len(decoded_suffix.encode("utf-8", errors="strict")) > MAX_HOSTED_BFF_PATH_BYTES:
        raise ValueError("Admin BFF path is too long")

    encoded_suffix = quote(
        decoded_suffix,
        safe="/:@!$&'()*+,;=-._~",
        encoding="utf-8",
        errors="strict",
    )
    query = _filtered_hosted_admin_query(parsed.query)
    upstream = f"{WEB_SESSION_PREFIX}/proxy{encoded_suffix}"
    return f"{upstream}?{query}" if query else upstream


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
        ["npx", "supabase", "status", "-o", "env", "--workdir", "backend"],
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
    normalized_name = str(name)
    normalized_value = str(value)
    if not HEADER_NAME_PATTERN.fullmatch(normalized_name):
        return None
    if any(character in normalized_value for character in ("\r", "\n", "\x00")):
        return None
    if len(normalized_value.encode("utf-8", errors="strict")) > MAX_HEADER_VALUE_BYTES:
        return None
    return normalized_name, normalized_value


def decode_base64url(value: str) -> bytes | None:
    try:
        padded = value + "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(padded.encode("ascii"))
    except (ValueError, UnicodeError):
        return None


def encode_base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def normalized_session_envelope(value: object) -> str | None:
    candidate = str(value).strip()
    if len(candidate.encode("utf-8", errors="strict")) > MAX_SESSION_ENVELOPE_BYTES:
        return None
    match = SESSION_ENVELOPE_PATTERN.fullmatch(candidate)
    if not match:
        return None
    iv = decode_base64url(match.group(1))
    encrypted = decode_base64url(match.group(2))
    if iv is None or encrypted is None or len(iv) != 12 or not 17 <= len(encrypted) <= 3700:
        return None
    return f"v1.{encode_base64url(iv)}.{encode_base64url(encrypted)}"


def normalized_session_request_cookie(
    value: object,
    request_path: str,
) -> str | None:
    if is_player_web_session_path(request_path):
        accepted_names = {PLAYER_LOCAL_SESSION_COOKIE, PLAYER_REMOTE_SESSION_COOKIE}
        local_name = PLAYER_LOCAL_SESSION_COOKIE
    elif is_admin_web_session_path(request_path):
        accepted_names = {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}
        local_name = LOCAL_SESSION_COOKIE
    else:
        return None
    for segment in str(value).split(";"):
        name, separator, raw_value = segment.strip().partition("=")
        if not separator or name not in accepted_names:
            continue
        envelope = normalized_session_envelope(raw_value)
        if envelope:
            return f"{local_name}={envelope}"
    return None


def normalized_session_response_cookie(value: object) -> str | None:
    first, *_attributes = str(value).split(";")
    name, separator, raw_value = first.strip().partition("=")
    if not separator:
        return None
    if name in {PLAYER_LOCAL_SESSION_COOKIE, PLAYER_REMOTE_SESSION_COOKIE}:
        local_name = PLAYER_LOCAL_SESSION_COOKIE
        maximum_age = 14_400
    elif name in {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}:
        local_name = LOCAL_SESSION_COOKIE
        maximum_age = 28_800
    else:
        return None
    if raw_value == "":
        return f"{local_name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"
    envelope = normalized_session_envelope(raw_value)
    if not envelope:
        return None
    return (
        f"{local_name}={envelope}; Path=/; Max-Age={maximum_age}; "
        "HttpOnly; SameSite=Strict"
    )


def filtered_request_headers(
    headers,
    upstream_host: str,
    *,
    browser_publishable_key: str,
    request_path: str = "/",
    browser_origin: str = "http://127.0.0.1:4173",
) -> dict[str, str]:
    result: dict[str, str] = {}
    prohibited_bearer = f"Bearer {browser_publishable_key}"
    web_session_request = is_web_session_path(request_path)
    admin_web_session_request = is_admin_web_session_path(request_path)
    for name, value in headers.items():
        pair = safe_header_pair(name, value)
        if pair is None:
            continue
        safe_name, safe_value = pair
        lower_name = safe_name.lower()
        if lower_name in HOP_BY_HOP_HEADERS or lower_name in FORWARDED_IP_HEADERS:
            continue
        if lower_name == "cookie":
            if web_session_request:
                session_cookie = normalized_session_request_cookie(
                    safe_value,
                    request_path,
                )
                if session_cookie:
                    result["Cookie"] = session_cookie
            continue
        canonical_name = REQUEST_HEADER_ALLOWLIST.get(lower_name)
        if canonical_name is None:
            continue
        if lower_name == "authorization":
            if admin_web_session_request or safe_value.strip() == prohibited_bearer:
                continue
        result[canonical_name] = safe_value
    if web_session_request and "Origin" not in result:
        result["Origin"] = browser_origin
    result["Host"] = upstream_host
    result["x-real-ip"] = "127.0.0.1"
    return result


def _sha256_hex(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def signed_local_admin_bff_headers(
    headers: dict[str, str],
    *,
    method: str,
    target_url: str,
    body: bytes | None,
) -> dict[str, str]:
    """Add the public local-development envelope accepted only by loopback Edge."""
    parsed = urlsplit(target_url)
    if (
        parsed.scheme != "http"
        or parsed.hostname != "kong"
        or parsed.port != 8000
        or not is_admin_web_session_path(parsed.path)
        or parsed.fragment
    ):
        raise ValueError("local Admin BFF signatures require the local Kong target")

    result = dict(headers)
    result.pop("Authorization", None)
    timestamp = int(time.time())
    nonce = str(uuid.uuid4())
    client_ip = "127.0.0.1"
    result[ADMIN_BFF_TIMESTAMP_HEADER] = str(timestamp)
    result[ADMIN_BFF_NONCE_HEADER] = nonce
    result[ADMIN_BFF_CLIENT_IP_HEADER] = client_ip
    result[ADMIN_BFF_MODE_HEADER] = "local"
    normalized = {str(name).lower(): str(value) for name, value in result.items()}
    context = "\n".join(
        f"{name}:{normalized.get(name, '')}"
        for name in ADMIN_BFF_SIGNED_CONTEXT_HEADERS
    )
    canonical = "\n".join((
        ADMIN_BFF_SIGNATURE_VERSION,
        f"timestamp:{timestamp}",
        f"nonce:{nonce}",
        f"method:{method.upper()}",
        f"target-origin:{parsed.scheme}://{parsed.netloc}",
        f"path:{parsed.path}{('?' + parsed.query) if parsed.query else ''}",
        f"browser-origin:{normalized.get('origin', '')}",
        f"client-ip:{client_ip}",
        f"context-sha256:{_sha256_hex(context.encode('utf-8'))}",
        f"body-sha256:{_sha256_hex(body or b'')}",
    ))
    signing_key = hmac.new(
        ADMIN_BFF_LOCAL_SIGNING_MATERIAL,
        ADMIN_BFF_SIGNING_KEY_CONTEXT,
        hashlib.sha256,
    ).digest()
    signature = hmac.new(
        signing_key,
        canonical.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    result[ADMIN_BFF_SIGNATURE_HEADER] = f"v1={encode_base64url(signature)}"
    return result


def maybe_signed_local_admin_bff_headers(
    headers: dict[str, str],
    *,
    local_supabase: bool,
    method: str,
    upstream_path: str,
    body: bytes | None,
) -> dict[str, str]:
    if not local_supabase or not is_admin_web_session_path(upstream_path):
        return dict(headers)
    return signed_local_admin_bff_headers(
        headers,
        method=method,
        target_url=f"{ADMIN_BFF_LOCAL_TARGET_ORIGIN}{upstream_path}",
        body=body,
    )


def normalize_content_type(value: object) -> str:
    pair = safe_header_pair("Content-Type", value)
    if pair is None:
        return "application/octet-stream"
    media_type = pair[1].split(";", 1)[0].strip().lower()
    return CONTENT_TYPE_ALLOWLIST.get(media_type, "application/octet-stream")


def normalize_retry_after(value: object) -> str | None:
    pair = safe_header_pair("Retry-After", value)
    if pair is None:
        return None
    candidate = pair[1].strip()
    if not candidate.isdigit():
        return None
    seconds = int(candidate)
    if not 0 <= seconds <= 86_400:
        return None
    return str(seconds)


def normalize_request_id(value: object) -> str | None:
    pair = safe_header_pair("X-Request-Id", value)
    if pair is None:
        return None
    candidate = pair[1].strip()
    return candidate if SAFE_REQUEST_ID_PATTERN.fullmatch(candidate) else None


def filtered_response_headers(headers) -> SafeResponseMetadata:
    """Reconstruct a tiny response contract; never forward arbitrary header names."""
    values: dict[str, object] = {}
    session_cookie: str | None = None
    for name, value in headers:
        lower_name = str(name).lower()
        if lower_name in {"content-type", "retry-after", "x-request-id"}:
            values[lower_name] = value
        elif lower_name == "set-cookie" and session_cookie is None:
            session_cookie = normalized_session_response_cookie(value)
    return SafeResponseMetadata(
        content_type=normalize_content_type(values.get("content-type", "")),
        retry_after=normalize_retry_after(values.get("retry-after", "")),
        request_id=normalize_request_id(values.get("x-request-id", "")),
        session_cookie=session_cookie,
    )


class EconovariaGatewayHandler(SimpleHTTPRequestHandler):
    server_version = "EconovariaGateway/3.0"

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
        if len(self.path.encode("utf-8", errors="strict")) > MAX_REQUEST_TARGET_BYTES:
            self._send_json_error(414, "request_target_too_long", "The request target is too long.")
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
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def _proxy(self) -> None:
        server = self.server  # type: ignore[assignment]
        publishable_key = server.publishable_key  # type: ignore[attr-defined]

        if len(self.path.encode("utf-8", errors="strict")) > MAX_REQUEST_TARGET_BYTES:
            self._send_json_error(414, "request_target_too_long", "The request target is too long.")
            return
        if self.command != "OPTIONS":
            supplied_key = str(self.headers.get("apikey") or "").strip()
            if supplied_key != publishable_key:
                self._send_json_error(
                    401,
                    "invalid_publishable_key",
                    "The request did not include the configured publishable API key.",
                )
                return

        try:
            mapped_admin_path = local_admin_bff_upstream_path(
                self.path,
                local_supabase=server.local_supabase,  # type: ignore[attr-defined]
            )
        except PermissionError:
            self._send_json_error(
                403,
                "local_admin_bff_disabled",
                "Hosted-style Administrator routes are available only with local Supabase.",
            )
            return
        except (UnicodeError, ValueError):
            self._send_json_error(
                400,
                "invalid_admin_bff_path",
                "The Administrator request path is invalid.",
            )
            return
        upstream_path = mapped_admin_path or self.path

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
            upstream_headers = filtered_request_headers(
                self.headers,
                upstream.netloc,
                browser_publishable_key=publishable_key,
                request_path=upstream_path,
                browser_origin=server.browser_origin,  # type: ignore[attr-defined]
            )
            upstream_headers = maybe_signed_local_admin_bff_headers(
                upstream_headers,
                local_supabase=server.local_supabase,  # type: ignore[attr-defined]
                method=self.command,
                upstream_path=upstream_path,
                body=body,
            )
            connection.request(
                self.command,
                upstream_path,
                body=body,
                headers=upstream_headers,
            )
            upstream_response = connection.getresponse()
            payload = upstream_response.read(MAX_PROXY_BODY_BYTES + 1)
            if len(payload) > MAX_PROXY_BODY_BYTES:
                self._send_json_error(
                    502,
                    "upstream_response_too_large",
                    "The upstream response exceeded the gateway limit.",
                )
                return
            metadata = filtered_response_headers(upstream_response.getheaders())

            self.send_response(upstream_response.status)
            self.send_header("Content-Type", metadata.content_type)
            if metadata.retry_after is not None:
                self.send_header("Retry-After", metadata.retry_after)
            if metadata.request_id is not None:
                self.send_header("X-Request-Id", metadata.request_id)
            if metadata.session_cookie is not None:
                self.send_header("Set-Cookie", metadata.session_cookie)
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
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
        local_supabase: bool = False,
    ):
        parsed = urlsplit(upstream_url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("upstream_url must be an absolute HTTP(S) URL")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("upstream_url must not contain credentials, query, or fragment")
        if local_supabase and (
            parsed.hostname not in LOCAL_HOSTS
            or parsed.path not in {"", "/"}
        ):
            raise ValueError(
                "local Admin BFF mode requires an exact loopback Supabase upstream"
            )
        super().__init__(server_address, handler_class)
        self.upstream = parsed
        self.publishable_key = publishable_key
        self.request_timeout = request_timeout
        self.local_supabase = local_supabase
        self.browser_origin = f"http://127.0.0.1:{self.server_address[1]}"


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
            local_supabase=args.local_supabase,
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
        "remain server-side in an encrypted HttpOnly session."
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
