#!/usr/bin/env python3
"""Exact-checked Player web-session extension for the local Econovaria gateway."""

from __future__ import annotations

from pathlib import Path

CORE_PATH = Path(__file__).with_name("econovaria-local-gateway-core.py")
source = CORE_PATH.read_text(encoding="utf-8")

replacements = (
    (
        'WEB_SESSION_PREFIX: Final[str] = "/functions/v1/web-session-api"\n'
        'LOCAL_SESSION_COOKIE: Final[str] = "econovaria_admin_session"\n'
        'REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_admin_session"',
        'WEB_SESSION_PREFIX: Final[str] = "/functions/v1/web-session-api"\n'
        'PLAYER_WEB_SESSION_PREFIX: Final[str] = "/functions/v1/player-web-session-api"\n'
        'LOCAL_SESSION_COOKIE: Final[str] = "econovaria_admin_session"\n'
        'REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_admin_session"\n'
        'PLAYER_LOCAL_SESSION_COOKIE: Final[str] = "econovaria_player_session"\n'
        'PLAYER_REMOTE_SESSION_COOKIE: Final[str] = "__Host-econovaria_player_session"',
        "session constants",
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
)

for old, new, label in replacements:
    occurrences = source.count(old)
    if occurrences != 1:
        raise RuntimeError(
            f"Econovaria gateway adapter expected one {label}, found {occurrences}."
        )
    source = source.replace(old, new, 1)

exec(compile(source, str(CORE_PATH), "exec"), globals(), globals())
