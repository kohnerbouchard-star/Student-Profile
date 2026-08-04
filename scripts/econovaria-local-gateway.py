#!/usr/bin/env python3
"""Compatibility entrypoint for the canonical Econovaria local gateway."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


CORE_PATH = Path(__file__).with_name("econovaria-local-gateway-core.py")
CORE_MODULE_NAME = "econovaria_local_gateway_core"


def _load_core():
    existing = sys.modules.get(CORE_MODULE_NAME)
    if existing is not None:
        return existing
    spec = importlib.util.spec_from_file_location(CORE_MODULE_NAME, CORE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Econovaria gateway core could not be loaded.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[CORE_MODULE_NAME] = module
    spec.loader.exec_module(module)
    return module


_core = _load_core()
for _name in dir(_core):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_core, _name)


if __name__ == "__main__":
    raise SystemExit(_core.main())
