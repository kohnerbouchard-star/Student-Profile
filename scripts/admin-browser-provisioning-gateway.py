#!/usr/bin/env python3
"""Run the local staging gateway with a bounded provisioning timeout.

The ordinary local gateway deliberately fails fast after 30 seconds. Creating a
fully provisioned Econovaria game is a heavier acceptance-only operation, so the
rendered Admin browser journey uses this wrapper to extend that upstream timeout
without weakening the default gateway used for normal development traffic.
"""

from __future__ import annotations

import importlib.util
import os
import socket
from pathlib import Path
from types import ModuleType

DEFAULT_TIMEOUT_SECONDS = 180
MIN_TIMEOUT_SECONDS = 31
MAX_TIMEOUT_SECONDS = 600


def read_timeout_seconds() -> int:
    raw_value = os.environ.get(
        "ECONOVARIA_BROWSER_PROVISIONING_TIMEOUT_SECONDS",
        str(DEFAULT_TIMEOUT_SECONDS),
    ).strip()
    try:
        timeout_seconds = int(raw_value)
    except ValueError as error:
        raise SystemExit(
            "ECONOVARIA_BROWSER_PROVISIONING_TIMEOUT_SECONDS must be an integer"
        ) from error

    if not MIN_TIMEOUT_SECONDS <= timeout_seconds <= MAX_TIMEOUT_SECONDS:
        raise SystemExit(
            "ECONOVARIA_BROWSER_PROVISIONING_TIMEOUT_SECONDS must be between "
            f"{MIN_TIMEOUT_SECONDS} and {MAX_TIMEOUT_SECONDS}"
        )
    return timeout_seconds


def load_gateway_module() -> ModuleType:
    gateway_path = Path(__file__).with_name("local-staging-gateway.py")
    spec = importlib.util.spec_from_file_location(
        "econovaria_local_staging_gateway",
        gateway_path,
    )
    if spec is None or spec.loader is None:
        raise SystemExit(f"Could not load local gateway: {gateway_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def extend_default_connection_timeout(module: ModuleType, timeout_seconds: int) -> None:
    original_http_connection = module.http.client.HTTPConnection
    original_https_connection = module.http.client.HTTPSConnection

    class ProvisioningHTTPConnection(original_http_connection):
        def __init__(self, *args, **kwargs):
            if kwargs.get("timeout") == 30:
                kwargs["timeout"] = timeout_seconds
            super().__init__(*args, **kwargs)

    class ProvisioningHTTPSConnection(original_https_connection):
        def __init__(self, *args, **kwargs):
            if kwargs.get("timeout") == 30:
                kwargs["timeout"] = timeout_seconds
            super().__init__(*args, **kwargs)

    module.http.client.HTTPConnection = ProvisioningHTTPConnection
    module.http.client.HTTPSConnection = ProvisioningHTTPSConnection
    module.socket = socket


def main() -> int:
    timeout_seconds = read_timeout_seconds()
    gateway = load_gateway_module()
    extend_default_connection_timeout(gateway, timeout_seconds)
    print(
        "Admin browser provisioning gateway upstream timeout: "
        f"{timeout_seconds} seconds",
        flush=True,
    )
    return gateway.main()


if __name__ == "__main__":
    raise SystemExit(main())
