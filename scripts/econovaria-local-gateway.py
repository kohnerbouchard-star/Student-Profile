#!/usr/bin/env python3
"""Exact-checked Player and signed Admin web-session extension for the local gateway."""

from __future__ import annotations

from pathlib import Path

CORE_PATH = Path(__file__).with_name("econovaria-local-gateway-core.py")
source = CORE_PATH.read_text(encoding="utf-8")

replacements = (
    (
        'import http.client\nimport json\nimport os\n',
        'import hashlib\nimport hmac\nimport http.client\nimport json\nimport os\nimport time\nimport uuid\n',
        "local BFF signing imports",
    ),
    (
        'WEB_SESSION_PREFIX: Final[str] = "/functions/v1/web-session-api"\n'
        'LOCAL_SESSION_COOKIE: Final[str] = "econovaria_admin_session"\n'
        'REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_admin_session"',
        'WEB_SESSION_PREFIX: Final[str] = "/functions/v1/web-session-api"\n'
        'PLAYER_WEB_SESSION_PREFIX: Final[str] = "/functions/v1/player-web-session-api"\n'
        'LOCAL_SESSION_COOKIE: Final[str] = "econovaria_admin_session"\n'
        'REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_admin_session"\n'
        'PLAYER_LOCAL_SESSION_COOKIE: Final[str] = "econovaria_player_session"\n'
        'PLAYER_REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_player_session"\n'
        'ADMIN_BFF_TIMESTAMP_HEADER: Final[str] = "x-econovaria-bff-timestamp"\n'
        'ADMIN_BFF_NONCE_HEADER: Final[str] = "x-econovaria-bff-nonce"\n'
        'ADMIN_BFF_CLIENT_IP_HEADER: Final[str] = "x-econovaria-bff-client-ip"\n'
        'ADMIN_BFF_SIGNATURE_HEADER: Final[str] = "x-econovaria-bff-signature"\n'
        'ADMIN_BFF_MODE_HEADER: Final[str] = "x-econovaria-bff-mode"\n'
        'ADMIN_BFF_SIGNATURE_VERSION: Final[str] = "econovaria-admin-bff-request-v1"\n'
        'ADMIN_BFF_SIGNING_KEY_CONTEXT: Final[bytes] = b"econovaria-admin-bff-signing-key-v1"\n'
        'ADMIN_BFF_LOCAL_SIGNING_MATERIAL: Final[bytes] = b"econovaria-local-admin-bff-public-development-material-v1"\n'
        'ADMIN_BFF_SIGNED_CONTEXT_HEADERS: Final[tuple[str, ...]] = (\n'
        '    "content-type",\n'
        '    "cookie",\n'
        '    "x-econovaria-csrf-token",\n'
        '    "x-econovaria-device-id",\n'
        '    "x-econovaria-game-id",\n'
        '    "x-idempotency-key",\n'
        '    "x-request-id",\n'
        ')',
        "session and local BFF constants",
    ),
    (
        'def is_web_session_path(path: str) -> bool:\n'
        '    return clean_path(path).startswith(WEB_SESSION_PREFIX)',
        'def is_admin_web_session_path(path: str) -> bool:\n'
        '    return clean_path(path).startswith(WEB_SESSION_PREFIX)\n\n\n'
        'def is_player_web_session_path(path: str) -> bool:\n'
        '    return clean_path(path).startswith(PLAYER_WEB_SESSION_PREFIX)\n\n\n'
        'def is_web_session_path(path: str) -> bool:\n'
        '    return is_admin_web_session_path(path) or is_player_web_session_path(path)',
        "session path classification",
    ),
    (
        'def normalized_session_request_cookie(value: object) -> str | None:\n'
        '    for segment in str(value).split(";"):\n'
        '        name, separator, raw_value = segment.strip().partition("=")\n'
        '        if not separator or name not in {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}:\n'
        '            continue\n'
        '        envelope = normalized_session_envelope(raw_value)\n'
        '        if envelope:\n'
        '            return f"{LOCAL_SESSION_COOKIE}={envelope}"\n'
        '    return None',
        'def normalized_session_request_cookie(\n'
        '    value: object,\n'
        '    request_path: str,\n'
        ') -> str | None:\n'
        '    if is_player_web_session_path(request_path):\n'
        '        accepted_names = {PLAYER_LOCAL_SESSION_COOKIE, PLAYER_REMOTE_SESSION_COOKIE}\n'
        '        local_name = PLAYER_LOCAL_SESSION_COOKIE\n'
        '    elif is_admin_web_session_path(request_path):\n'
        '        accepted_names = {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}\n'
        '        local_name = LOCAL_SESSION_COOKIE\n'
        '    else:\n'
        '        return None\n'
        '    for segment in str(value).split(";"):\n'
        '        name, separator, raw_value = segment.strip().partition("=")\n'
        '        if not separator or name not in accepted_names:\n'
        '            continue\n'
        '        envelope = normalized_session_envelope(raw_value)\n'
        '        if envelope:\n'
        '            return f"{local_name}={envelope}"\n'
        '    return None',
        "request cookie normalization",
    ),
    (
        'def normalized_session_response_cookie(value: object) -> str | None:\n'
        '    first, *_attributes = str(value).split(";")\n'
        '    name, separator, raw_value = first.strip().partition("=")\n'
        '    if not separator or name not in {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}:\n'
        '        return None\n'
        '    if raw_value == "":\n'
        '        return f"{LOCAL_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"\n'
        '    envelope = normalized_session_envelope(raw_value)\n'
        '    if not envelope:\n'
        '        return None\n'
        '    return (\n'
        '        f"{LOCAL_SESSION_COOKIE}={envelope}; Path=/; Max-Age=28800; "\n'
        '        "HttpOnly; SameSite=Strict"\n'
        '    )',
        'def normalized_session_response_cookie(value: object) -> str | None:\n'
        '    first, *_attributes = str(value).split(";")\n'
        '    name, separator, raw_value = first.strip().partition("=")\n'
        '    if not separator:\n'
        '        return None\n'
        '    if name in {PLAYER_LOCAL_SESSION_COOKIE, PLAYER_REMOTE_SESSION_COOKIE}:\n'
        '        local_name = PLAYER_LOCAL_SESSION_COOKIE\n'
        '        maximum_age = 14400\n'
        '    elif name in {LOCAL_SESSION_COOKIE, REMOTE_SESSION_COOKIE}:\n'
        '        local_name = LOCAL_SESSION_COOKIE\n'
        '        maximum_age = 28800\n'
        '    else:\n'
        '        return None\n'
        '    if raw_value == "":\n'
        '        return f"{local_name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict"\n'
        '    envelope = normalized_session_envelope(raw_value)\n'
        '    if not envelope:\n'
        '        return None\n'
        '    return (\n'
        '        f"{local_name}={envelope}; Path=/; Max-Age={maximum_age}; "\n'
        '        "HttpOnly; SameSite=Strict"\n'
        '    )',
        "response cookie normalization",
    ),
    (
        'session_cookie = normalized_session_request_cookie(safe_value)',
        'session_cookie = normalized_session_request_cookie(safe_value, request_path)',
        "request cookie call",
    ),
    (
        '    "x-player-session-token": "x-player-session-token",\n',
        '',
        "legacy Player token allowlist entry",
    ),
    (
        '\n\ndef normalize_content_type(value: object) -> str:\n',
        '''

def _sha256_hex(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def signed_local_admin_bff_headers(
    headers: dict[str, str],
    *,
    method: str,
    target_url: str,
    body: bytes | None,
) -> dict[str, str]:
    result = dict(headers)
    timestamp = int(time.time())
    nonce = str(uuid.uuid4())
    client_ip = "127.0.0.1"
    result[ADMIN_BFF_TIMESTAMP_HEADER] = str(timestamp)
    result[ADMIN_BFF_NONCE_HEADER] = nonce
    result[ADMIN_BFF_CLIENT_IP_HEADER] = client_ip
    result[ADMIN_BFF_MODE_HEADER] = "local"
    normalized = {str(name).lower(): str(value) for name, value in result.items()}
    context = "\\n".join(
        f"{name}:{normalized.get(name, '')}"
        for name in ADMIN_BFF_SIGNED_CONTEXT_HEADERS
    )
    parsed = urlsplit(target_url)
    canonical = "\\n".join((
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
        signing_key, canonical.encode("utf-8"), hashlib.sha256
    ).digest()
    result[ADMIN_BFF_SIGNATURE_HEADER] = f"v1={encode_base64url(signature)}"
    return result


def normalize_content_type(value: object) -> str:
''',
        "local Admin BFF signing helper",
    ),
    (
        '        try:\n'
        '            connection.request(\n'
        '                self.command,\n'
        '                self.path,\n'
        '                body=body,\n'
        '                headers=filtered_request_headers(\n'
        '                    self.headers,\n'
        '                    upstream.netloc,\n'
        '                    browser_publishable_key=publishable_key,\n'
        '                    request_path=self.path,\n'
        '                    browser_origin=server.browser_origin,  # type: ignore[attr-defined]\n'
        '                ),\n'
        '            )',
        '        try:\n'
        '            upstream_headers = filtered_request_headers(\n'
        '                self.headers,\n'
        '                upstream.netloc,\n'
        '                browser_publishable_key=publishable_key,\n'
        '                request_path=self.path,\n'
        '                browser_origin=server.browser_origin,  # type: ignore[attr-defined]\n'
        '            )\n'
        '            if is_admin_web_session_path(self.path):\n'
        '                upstream_headers = signed_local_admin_bff_headers(\n'
        '                    upstream_headers,\n'
        '                    method=self.command,\n'
        '                    target_url=f"http://kong:8000{self.path}",\n'
        '                    body=body,\n'
        '                )\n'
        '            connection.request(\n'
        '                self.command,\n'
        '                self.path,\n'
        '                body=body,\n'
        '                headers=upstream_headers,\n'
        '            )',
        "signed local Admin request dispatch",
    ),
)

for old, new, label in replacements:
    occurrences = source.count(old)
    if occurrences != 1:
        raise RuntimeError(
            f"Econovaria gateway adapter expected one {label}, found {occurrences}."
        )
    source = source.replace(old, new, 1)

exec(compile(source, str(CORE_PATH), "exec"), globals(), globals())
