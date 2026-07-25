#!/usr/bin/env python3
"""Run the repository local/staging gateway with a bounded long-request timeout.

Cold local Supabase stacks can require more than 30 seconds to atomically create,
provision, verify, and activate a new multiplayer game. The underlying gateway is
kept as the single routing/configuration implementation; this launcher only raises
its upstream socket timeout to the bounded value configured by
ECONOVARIA_GATEWAY_REQUEST_TIMEOUT_SECONDS (default: 180 seconds).
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from types import ModuleType

DEFAULT_REQUEST_TIMEOUT_SECONDS = 180.0
MINIMUM_REQUEST_TIMEOUT_SECONDS = 30.0
MAXIMUM_REQUEST_TIMEOUT_SECONDS = 300.0


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


def load_gateway() -> ModuleType:
    path = Path(__file__).with_name("local-staging-gateway.py")
    spec = importlib.util.spec_from_file_location("econovaria_local_staging_gateway", path)
    if spec is None or spec.loader is None:
        raise SystemExit(f"Could not load local gateway implementation: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def install_timeout(module: ModuleType, timeout_seconds: float) -> None:
    base_http = module.http.client.HTTPConnection
    base_https = module.http.client.HTTPSConnection

    class BoundedHTTPConnection(base_http):
        def __init__(self, *args, **kwargs):
            requested = kwargs.get("timeout")
            if requested is None or isinstance(requested, (int, float)):
                kwargs["timeout"] = max(float(requested or 0), timeout_seconds)
            super().__init__(*args, **kwargs)

    class BoundedHTTPSConnection(base_https):
        def __init__(self, *args, **kwargs):
            requested = kwargs.get("timeout")
            if requested is None or isinstance(requested, (int, float)):
                kwargs["timeout"] = max(float(requested or 0), timeout_seconds)
            super().__init__(*args, **kwargs)

    module.http.client.HTTPConnection = BoundedHTTPConnection
    module.http.client.HTTPSConnection = BoundedHTTPSConnection


def main() -> int:
    timeout_seconds = configured_timeout()
    module = load_gateway()
    install_timeout(module, timeout_seconds)
    print(
        "Econovaria gateway upstream request timeout: "
        f"{timeout_seconds:g} seconds",
        flush=True,
    )
    return int(module.main())


if __name__ == "__main__":
    raise SystemExit(main())
